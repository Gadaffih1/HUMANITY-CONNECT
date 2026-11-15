import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { eq, desc, and, sql, asc } from 'drizzle-orm';
import { db, withDbRetry } from '../db/index.ts';
import { ensureStaffEstablishmentDirectoryReady } from '../db/staffEstablishmentSchema.ts';
import {
  staffDepartments,
  staffPositions,
  staffPositionRevisions,
  staffVacancies,
  recruitmentApplications,
  staffEmployeeProfiles,
  staffDisciplinaryRecords,
  fieldGeographyOfficers,
  departmentalWorkspaceItems,
  staffPerformanceReviews,
  internalStaffTasks,
  internalStaffMessages,
  notifications,
  verificationCases,
  beneficiaryProfiles,
  humanitarianFunds,
  communityProjects,
  volunteerAssignments,
  empowermentMilestones,
  staffOnboardingChecklists,
} from '../db/schema.ts';
import {
  requireAuth,
  optionalAuth,
  requirePrivilegedMfa,
  type AuthRequest,
  writeAuditLog,
} from '../middleware/auth.ts';
import { decryptSensitiveText, encryptSensitiveText } from '../lib/crypto.ts';
import { ORGANISATIONAL_DEPARTMENTS, STAFF_ESTABLISHMENT_170 } from '../data/staffEstablishment.ts';
import {
  ADMIN_ACCESS_ROLE_CODES,
  APPLICATION_NEGATIVE_STATUSES,
  KENYAN_47_COUNTIES,
  RECRUITMENT_STAGES,
  STAFF_EMPLOYMENT_STATUSES,
} from '../types/domain.ts';
import {
  screenGeneralCommunicationForConfidentiality,
  userCanViewSafeguardingCases,
} from '../lib/rbacPolicy.ts';
import {
  buildDefaultOnboardingMilestones,
  canVerifyOnboardingMilestone,
  computeOnboardingProgress,
  isOnboardingReadyForActivation,
} from '../lib/onboardingTracker.ts';

export const staffRouter = Router();

function isAuditorOnly(req: AuthRequest): boolean {
  const rolesList = req.authUser?.roles || [];
  return (
    (req.authUser?.activeRole === 'AUDITOR' || rolesList.includes('AUDITOR')) &&
    !rolesList.includes('SUPER_ADMIN')
  );
}

function hasHrAuthority(req: AuthRequest): boolean {
  const r = req.authUser?.roles || [];
  const p = req.authUser?.permissions || [];
  return r.includes('SUPER_ADMIN') || r.includes('HR_OFFICER') || p.includes('canManageHR');
}

function hasRecruitmentReadAuthority(req: AuthRequest): boolean {
  return hasHrAuthority(req) || isAuditorOnly(req);
}

function hasAdminStaffAccess(req: AuthRequest): boolean {
  if (!req.authUser) return false;
  return (
    req.authUser.roles.some((r) => ADMIN_ACCESS_ROLE_CODES.includes(r)) ||
    req.authUser.permissions.some((p) => p.startsWith('can'))
  );
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sanitizePublicPosition(pos: typeof staffPositions.$inferSelect) {
  return {
    id: pos.id,
    jobId: pos.jobId,
    departmentNumber: pos.departmentNumber,
    department: pos.department,
    jobTitle: pos.jobTitle,
    hierarchyLevel: pos.hierarchyLevel,
    reportsToJobId: pos.reportsToJobId,
    independentOversight: Boolean(pos.independentOversight),
    jobDescription: pos.jobDescription,
    mainResponsibilities: Array.isArray(pos.mainResponsibilities) ? pos.mainResponsibilities : [],
    dailyResponsibilities: Array.isArray(pos.dailyResponsibilities) ? pos.dailyResponsibilities : [],
    weeklyResponsibilities: Array.isArray(pos.weeklyResponsibilities) ? pos.weeklyResponsibilities : [],
    monthlyResponsibilities: Array.isArray(pos.monthlyResponsibilities) ? pos.monthlyResponsibilities : [],
    requiredQualifications: pos.requiredQualifications,
    professionalQualifications: pos.professionalQualifications,
    requiredExperience: pos.requiredExperience,
    professionalSkills: Array.isArray(pos.professionalSkills) ? pos.professionalSkills : [],
    communicationSkills: Array.isArray(pos.communicationSkills) ? pos.communicationSkills : [],
    ethicalRequirements: pos.ethicalRequirements,
    safeguardingResponsibilities: pos.safeguardingResponsibilities,
    reportingOfficer: pos.reportingOfficer,
    supervisoryResponsibilities: pos.supervisoryResponsibilities,
    geographicalJurisdiction: pos.geographicalJurisdiction,
    employmentStatus: pos.employmentStatus,
    workingConditions: pos.workingConditions,
    professionalDevelopment: pos.professionalDevelopment,
    performanceExpectations: pos.performanceExpectations,
    incumbentName: pos.incumbentName,
    actingOfficerName: pos.actingOfficerName,
    vacancyStatus: pos.vacancyStatus,
    isVacancyPublished: Boolean(pos.isVacancyPublished),
    vacancyPublishedAt: pos.vacancyPublishedAt,
    revisionStatus: pos.revisionStatus,
    revisionVersion: pos.revisionVersion,
  };
}

// Check which departments a role is naturally authorised to access
function canAccessDepartmentWorkspace(req: AuthRequest, deptNumber: number, userEmpDept?: number | null): boolean {
  const r = req.authUser?.roles || [];
  const p = req.authUser?.permissions || [];

  // Department 5 (Safeguarding & Protection): strictly protected (Rule #4 & #7)
  if (deptNumber === 5) {
    return userCanViewSafeguardingCases(r, p);
  }
  if (r.includes('SUPER_ADMIN') || r.includes('AUDITOR') || r.includes('DATA_MANAGEMENT_OFFICER')) {
    return true;
  }
  if (userEmpDept && userEmpDept === deptNumber) {
    return true;
  }
  const roleDeptMap: Record<string, number[]> = {
    HR_OFFICER: [1],
    VERIFICATION_OFFICER: [2, 13],
    WELFARE_OFFICER: [3, 9, 13],
    COUNTY_REPRESENTATIVE: [4, 8, 10],
    FIELD_OFFICER: [4, 2, 8, 10],
    FINANCE_OFFICER: [6, 7],
    SAFEGUARDING_OFFICER: [5, 15],
  };
  for (const roleCode of r) {
    if (roleDeptMap[roleCode]?.includes(deptNumber)) {
      return true;
    }
  }
  if (p.includes('canManageHR') && deptNumber === 1) return true;
  if (p.includes('canVerifyUsers') && deptNumber === 2) return true;
  if (p.includes('canManageFinanceAccounts') && deptNumber === 6) return true;
  if (p.includes('canManageCountyOps') && deptNumber === 4) return true;
  return false;
}

// =========================================================================
// 1. PUBLIC DIRECTORY, ORG CHART METADATA & JD DOWNLOAD (NO PRIVATE PII)
// =========================================================================

async function loadDirectoryEntitiesWithHealing() {
  let deptRows: Array<typeof staffDepartments.$inferSelect> = [];
  let posRows: Array<typeof staffPositions.$inferSelect> = [];

  try {
    [deptRows, posRows] = await withDbRetry(
      () =>
        Promise.all([
          db.select().from(staffDepartments).orderBy(asc(staffDepartments.departmentNumber)),
          db.select().from(staffPositions),
        ]),
      3
    );
  } catch (readErr: any) {
    const code = readErr?.code || readErr?.cause?.code;
    if (code === '42P01' || code === '42703') {
      await ensureStaffEstablishmentDirectoryReady();
      [deptRows, posRows] = await withDbRetry(
        () =>
          Promise.all([
            db.select().from(staffDepartments).orderBy(asc(staffDepartments.departmentNumber)),
            db.select().from(staffPositions),
          ]),
        3
      );
    } else {
      throw readErr;
    }
  }

  if (deptRows.length < ORGANISATIONAL_DEPARTMENTS.length || posRows.length < STAFF_ESTABLISHMENT_170.length) {
    await ensureStaffEstablishmentDirectoryReady().catch((healErr) => {
      console.warn('Staff establishment self-heal warning:', healErr);
    });
    [deptRows, posRows] = await withDbRetry(
      () =>
        Promise.all([
          db.select().from(staffDepartments).orderBy(asc(staffDepartments.departmentNumber)),
          db.select().from(staffPositions),
        ]),
      3
    );
  }

  return { deptRows, posRows };
}

staffRouter.get('/public/directory', async (req, res) => {
  try {
    const deptFilter = req.query.departmentNumber ? Number(req.query.departmentNumber) : null;
    const vacancyFilter = typeof req.query.vacancyStatus === 'string' ? req.query.vacancyStatus : 'ALL';
    const searchQ = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
    const sortMode = typeof req.query.sort === 'string' ? req.query.sort : 'id_asc';

    const { deptRows, posRows } = await loadDirectoryEntitiesWithHealing();
    const sanitizedAll = posRows.map(sanitizePublicPosition);

    const directorySources =
      deptRows.length > 0
        ? deptRows.map((d) => ({
            number: d.departmentNumber,
            name: d.name,
            code: d.code,
            plannedCount: d.plannedCount,
            headJobId: d.headJobId,
            workspaceFocus: d.workspaceFocus,
          }))
        : ORGANISATIONAL_DEPARTMENTS.map((d) => ({
            number: d.number,
            name: d.name,
            code: d.code,
            plannedCount: d.plannedCount,
            headJobId: null as string | null,
            workspaceFocus: d.name,
          }));

    const departmentSummary = directorySources.map((dept) => {
      const deptPositions = sanitizedAll.filter((p) => p.departmentNumber === dept.number);
      const filled = deptPositions.filter((p) => p.vacancyStatus === 'FILLED').length;
      const acting = deptPositions.filter((p) => p.vacancyStatus === 'ACTING').length;
      const recruiting = deptPositions.filter((p) => p.vacancyStatus === 'RECRUITING').length;
      const vacant = deptPositions.filter(
        (p) => p.vacancyStatus === 'VACANT' || p.vacancyStatus === 'RECRUITING'
      ).length;
      const fillRatePct =
        deptPositions.length > 0 ? Math.round(((filled + acting) / deptPositions.length) * 100) : 0;
      return {
        ...dept,
        approvedPositions: deptPositions.length,
        filledPositions: filled,
        actingPositions: acting,
        recruitingPositions: recruiting,
        vacantPositions: vacant,
        fillRatePct,
        understaffed: fillRatePct < 50,
      };
    });

    let filtered = sanitizedAll.filter((p) => {
      if (deptFilter && p.departmentNumber !== deptFilter) return false;
      if (vacancyFilter !== 'ALL' && p.vacancyStatus !== vacancyFilter) return false;
      if (searchQ) {
        const hay = `${p.jobId} ${p.jobTitle} ${p.department} ${p.geographicalJurisdiction} ${p.requiredQualifications} ${p.professionalQualifications}`.toLowerCase();
        if (!hay.includes(searchQ)) return false;
      }
      return true;
    });

    filtered = [...filtered].sort((a, b) => {
      if (sortMode === 'title_asc') return (a.jobTitle || '').localeCompare(b.jobTitle || '');
      if (sortMode === 'title_desc') return (b.jobTitle || '').localeCompare(a.jobTitle || '');
      return (a.jobId || '').localeCompare(b.jobId || '');
    });

    const totalFilled = sanitizedAll.filter((p) => p.vacancyStatus === 'FILLED').length;
    const totalActing = sanitizedAll.filter((p) => p.vacancyStatus === 'ACTING').length;
    const totalRecruiting = sanitizedAll.filter((p) => p.vacancyStatus === 'RECRUITING').length;
    const totalVacant = sanitizedAll.length - totalFilled - totalActing;

    res.json({
      stats: {
        totalApproved: sanitizedAll.length,
        filledCount: totalFilled,
        actingCount: totalActing,
        recruitingCount: totalRecruiting,
        vacantCount: totalVacant,
        publishedVacanciesCount: sanitizedAll.filter((p) => p.isVacancyPublished).length,
        departmentsCount: departmentSummary.length,
      },
      departments: departmentSummary,
      understaffedDepartments: departmentSummary.filter((d) => d.understaffed),
      positions: filtered,
      allHierarchyNodes: sanitizedAll.map((p) => ({
        jobId: p.jobId,
        jobTitle: p.jobTitle,
        departmentNumber: p.departmentNumber,
        department: p.department,
        hierarchyLevel: p.hierarchyLevel,
        reportsToJobId: p.reportsToJobId,
        independentOversight: p.independentOversight,
        incumbentName: p.incumbentName,
        actingOfficerName: p.actingOfficerName,
        vacancyStatus: p.vacancyStatus,
        geographicalJurisdiction: p.geographicalJurisdiction,
      })),
    });
  } catch (err: any) {
    console.error('Staff directory error:', {
      message: err?.message,
      code: err?.code || err?.cause?.code,
      table: err?.table || err?.cause?.table,
      column: err?.column || err?.cause?.column,
    });
    res.status(500).json({ error: 'Unable to load staff establishment directory.' });
  }
});

staffRouter.get('/public/departments', async (_req, res) => {
  try {
    const { deptRows, posRows } = await loadDirectoryEntitiesWithHealing();
    const departments = deptRows.map((dept) => {
      const deptPositions = posRows.filter((p) => p.departmentNumber === dept.departmentNumber);
      const filledPositions = deptPositions.filter((p) => p.vacancyStatus === 'FILLED').length;
      const actingPositions = deptPositions.filter((p) => p.vacancyStatus === 'ACTING').length;
      const recruitingPositions = deptPositions.filter((p) => p.vacancyStatus === 'RECRUITING').length;
      const vacantPositions = deptPositions.filter(
        (p) => p.vacancyStatus === 'VACANT' || p.vacancyStatus === 'RECRUITING'
      ).length;
      return {
        id: dept.id,
        number: dept.departmentNumber,
        code: dept.code,
        name: dept.name,
        plannedCount: dept.plannedCount,
        headJobId: dept.headJobId,
        workspaceFocus: dept.workspaceFocus,
        approvedPositions: deptPositions.length,
        filledPositions,
        actingPositions,
        recruitingPositions,
        vacantPositions,
      };
    });
    res.json({ departments, totalDepartments: departments.length });
  } catch (err) {
    console.error('Public departments error:', err);
    res.status(500).json({ error: 'Unable to load organisational department directories.' });
  }
});

// Downloadable formatted 20-point Job Description (.html or .txt)
staffRouter.get('/positions/:jobId/download', async (req, res) => {
  try {
    const jobId = String(req.params.jobId).trim().toUpperCase();
    const format = req.query.format === 'txt' ? 'txt' : 'html';
    const [pos] = await withDbRetry(() =>
      db
        .select()
        .from(staffPositions)
        .where(eq(staffPositions.jobId, jobId))
        .limit(1)
    );
    if (!pos) return res.status(404).json({ error: 'Approved position not found.' });

    if (format === 'txt') {
      const txt = [
        `HUMANITY CONNECT — OFFICIAL JOB DESCRIPTION & QUALIFICATION SPECIFICATION`,
        `========================================================================`,
        `1. Job Title: ${pos.jobTitle}`,
        `2. Department: Dept ${pos.departmentNumber} — ${pos.department}`,
        `3. Job Identification Number: ${pos.jobId}`,
        `4. Job Description: ${pos.jobDescription}`,
        `5. Main Responsibilities:\n${pos.mainResponsibilities.map((r, i) => `   ${i + 1}. ${r}`).join('\n')}`,
        `6. Daily Responsibilities:\n${pos.dailyResponsibilities.map((r, i) => `   ${i + 1}. ${r}`).join('\n')}`,
        `7. Weekly Responsibilities:\n${pos.weeklyResponsibilities.map((r, i) => `   ${i + 1}. ${r}`).join('\n')}`,
        `8. Monthly Responsibilities:\n${pos.monthlyResponsibilities.map((r, i) => `   ${i + 1}. ${r}`).join('\n')}`,
        `9. Required Academic Qualifications: ${pos.requiredQualifications}`,
        `10. Professional Qualifications: ${pos.professionalQualifications}`,
        `11. Required Experience: ${pos.requiredExperience}`,
        `12. Professional Skills: ${pos.professionalSkills.join('; ')}`,
        `13. Communication Skills: ${pos.communicationSkills.join('; ')}`,
        `14. Ethical Requirements: ${pos.ethicalRequirements}`,
        `15. Safeguarding Responsibilities: ${pos.safeguardingResponsibilities}`,
        `16. Reporting Officer: ${pos.reportingOfficer}`,
        `17. Supervisory Responsibilities: ${pos.supervisoryResponsibilities}`,
        `18. Geographical Jurisdiction: ${pos.geographicalJurisdiction}`,
        `19. Employment Status: ${pos.employmentStatus}`,
        `20. Working Conditions / CPD / Performance Expectations:`,
        `    Working Conditions: ${pos.workingConditions}`,
        `    CPD: ${pos.professionalDevelopment}`,
        `    Performance Expectations: ${pos.performanceExpectations}`,
        `Revision Version: v${pos.revisionVersion} (${pos.revisionStatus})`,
      ].join('\n\n');

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${pos.jobId}-Job-Description.txt"`);
      return res.send(txt);
    }

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(pos.jobId)} — ${escapeHtml(pos.jobTitle)} | HUMANITY CONNECT</title>
<style>
  body { font-family: system-ui, -apple-system, sans-serif; color: #102E36; max-width: 820px; margin: 32px auto; padding: 0 24px; line-height: 1.55; }
  header { border-bottom: 3px solid #102E36; padding-bottom: 14px; margin-bottom: 20px; }
  .org { color: #287A59; font-weight: 700; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; }
  h1 { margin: 4px 0; font-size: 24px; }
  .meta { font-size: 13px; color: #4A636A; }
  h2 { font-size: 14px; text-transform: uppercase; letter-spacing: .04em; color: #102E36; border-bottom: 1px solid #d7d2c7; padding-bottom: 4px; margin-top: 20px; }
  ul { margin: 6px 0 12px; padding-left: 20px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 13px; }
  .box { background: #FAF9F6; border: 1px solid #d7d2c7; border-radius: 8px; padding: 12px; }
  @media print { body { margin: 0; } }
</style>
</head>
<body>
  <header>
    <div class="org">HUMANITY CONNECT · National & International Staff Establishment</div>
    <h1>${escapeHtml(pos.jobTitle)}</h1>
    <div class="meta">Job ID: <strong>${escapeHtml(pos.jobId)}</strong> · Dept ${pos.departmentNumber}: ${escapeHtml(pos.department)} · Revision v${pos.revisionVersion} (${escapeHtml(pos.revisionStatus)})</div>
  </header>
  <h2>Job Description</h2>
  <p>${escapeHtml(pos.jobDescription)}</p>
  <div class="grid">
    <div class="box"><strong>Reporting Officer:</strong><br/>${escapeHtml(pos.reportingOfficer)}</div>
    <div class="box"><strong>Geographical Jurisdiction:</strong><br/>${escapeHtml(pos.geographicalJurisdiction)}</div>
    <div class="box"><strong>Employment Status:</strong><br/>${escapeHtml(pos.employmentStatus)}</div>
    <div class="box"><strong>Establishment Status:</strong><br/>${escapeHtml(pos.vacancyStatus)}</div>
  </div>
  <h2>Main Responsibilities</h2>
  <ul>${pos.mainResponsibilities.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}</ul>
  <h2>Daily, Weekly & Monthly Responsibilities</h2>
  <p><strong>Daily:</strong></p><ul>${pos.dailyResponsibilities.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}</ul>
  <p><strong>Weekly:</strong></p><ul>${pos.weeklyResponsibilities.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}</ul>
  <p><strong>Monthly:</strong></p><ul>${pos.monthlyResponsibilities.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}</ul>
  <h2>Academic, Professional & Experience Qualifications</h2>
  <p><strong>Academic:</strong> ${escapeHtml(pos.requiredQualifications)}</p>
  <p><strong>Professional Certification / Licence:</strong> ${escapeHtml(pos.professionalQualifications)}</p>
  <p><strong>Experience:</strong> ${escapeHtml(pos.requiredExperience)}</p>
  <h2>Skills & Supervisory Scope</h2>
  <p><strong>Professional Skills:</strong> ${pos.professionalSkills.map(escapeHtml).join(' · ')}</p>
  <p><strong>Communication Skills:</strong> ${pos.communicationSkills.map(escapeHtml).join(' · ')}</p>
  <p><strong>Supervisory Responsibilities:</strong> ${escapeHtml(pos.supervisoryResponsibilities)}</p>
  <h2>Ethics, Safeguarding & Performance Standards</h2>
  <p><strong>Ethical Requirements:</strong> ${escapeHtml(pos.ethicalRequirements)}</p>
  <p><strong>Safeguarding Responsibilities:</strong> ${escapeHtml(pos.safeguardingResponsibilities)}</p>
  <p><strong>Working Conditions:</strong> ${escapeHtml(pos.workingConditions)}</p>
  <p><strong>Continuing Professional Development:</strong> ${escapeHtml(pos.professionalDevelopment)}</p>
  <p><strong>Performance Expectations:</strong> ${escapeHtml(pos.performanceExpectations)}</p>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${pos.jobId}-Job-Description.html"`);
    res.send(html);
  } catch (err) {
    console.error('JD download error:', err);
    res.status(500).json({ error: 'Unable to export job description.' });
  }
});

// Public Published Vacancies (No applicant PII exposed)
staffRouter.get('/public/vacancies', async (_req, res) => {
  try {
    await loadDirectoryEntitiesWithHealing();
    const published = await withDbRetry(() =>
      db
        .select()
        .from(staffVacancies)
        .where(eq(staffVacancies.stage, 'PUBLISHED'))
        .orderBy(desc(staffVacancies.publishedAt))
    );
    res.json({ vacancies: published });
  } catch (err) {
    console.error('Public vacancies error:', err);
    res.status(500).json({ error: 'Unable to load published vacancies.' });
  }
});

// Public / Signed-In Job Application Submission (PII Encrypted at Rest)
staffRouter.post('/public/apply', optionalAuth, async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      vacancyId: z.string().uuid(),
      fullName: z.string().min(3).max(120),
      email: z.string().email(),
      phone: z.string().min(8).max(24),
      nationalId: z.string().min(4).max(32).optional(),
      county: z.string().min(2).default('Nairobi'),
      academicSummary: z.string().min(6).max(600),
      professionalCertsSummary: z.string().min(3).max(600),
      experienceYears: z.number().int().min(0).max(50),
      coverNote: z.string().min(20).max(3000),
      documentNames: z.array(z.string()).default(['Curriculum Vitae (CV)', 'Academic & Professional Certificates']),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Complete application details required.' });
    }
    const d = parsed.data;

    const [vacancy] = await db
      .select()
      .from(staffVacancies)
      .where(eq(staffVacancies.id, d.vacancyId))
      .limit(1);
    if (!vacancy || vacancy.stage !== 'PUBLISHED') {
      return res.status(400).json({ error: 'This vacancy is not currently open for applications.' });
    }
    if (new Date() > new Date(vacancy.applicationDeadline)) {
      return res.status(400).json({ error: 'The application deadline for this vacancy has passed.' });
    }

    const appRef = `APP-${new Date().getFullYear()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const created = await db.transaction(async (tx) => {
      const [appRow] = await tx
        .insert(recruitmentApplications)
        .values({
          applicationRef: appRef,
          vacancyId: vacancy.id,
          jobId: vacancy.jobId,
          applicantUserId: req.authUser?.userId || null,
          applicantNameEnc: encryptSensitiveText(d.fullName.trim()),
          applicantEmailEnc: encryptSensitiveText(d.email.trim().toLowerCase()),
          applicantPhoneEnc: encryptSensitiveText(d.phone.trim()),
          nationalIdEnc: d.nationalId ? encryptSensitiveText(d.nationalId.trim()) : null,
          county: d.county,
          academicSummary: d.academicSummary.trim(),
          professionalCertsSummary: d.professionalCertsSummary.trim(),
          experienceYears: d.experienceYears,
          coverNote: d.coverNote.trim(),
          documentsJson: d.documentNames.map((n) => ({ name: n, docType: 'APPLICANT_UPLOAD', verified: false })),
          stage: 'APPLICATIONS_RECEIVED',
          stageNotes: 'Application submitted through Humanity Connect Recruitment Portal.',
        })
        .returning({
          id: recruitmentApplications.id,
          applicationRef: recruitmentApplications.applicationRef,
          jobId: recruitmentApplications.jobId,
          stage: recruitmentApplications.stage,
          createdAt: recruitmentApplications.createdAt,
        });

      await tx
        .update(staffPositions)
        .set({
          vacancyStatus: sql`CASE WHEN ${staffPositions.vacancyStatus} = 'VACANT' THEN 'RECRUITING' ELSE ${staffPositions.vacancyStatus} END`,
          updatedAt: new Date(),
        })
        .where(eq(staffPositions.jobId, vacancy.jobId));

      if (req.authUser?.userId) {
        await tx.insert(notifications).values({
          userId: req.authUser.userId,
          category: 'SYSTEM',
          title: `Application ${appRef} Received`,
          body: `Your application for ${vacancy.jobTitle} (${vacancy.jobId}) has entered Stage 4: Applications Received. Your personal information is encrypted and restricted to authorised HR officers.`,
        });
      }
      return appRow;
    });

    await writeAuditLog({
      actorUserId: req.authUser?.userId || null,
      actorRole: req.authUser?.activeRole || 'APPLICANT',
      action: 'VACANCY_APPLICATION_SUBMITTED',
      entityType: 'recruitment_applications',
      entityId: created.id,
      ip: req.ip,
      details: { applicationRef: appRef, jobId: vacancy.jobId },
    });

    res.status(201).json({ application: created });
  } catch (err) {
    console.error('Vacancy application error:', err);
    res.status(500).json({ error: 'Unable to submit job application.' });
  }
});

// Signed-in applicant self-view of own application statuses & notifications
staffRouter.get('/my-applications', requireAuth, async (req: AuthRequest, res) => {
  try {
    const myApps = await db
      .select({
        id: recruitmentApplications.id,
        applicationRef: recruitmentApplications.applicationRef,
        vacancyId: recruitmentApplications.vacancyId,
        jobId: recruitmentApplications.jobId,
        stage: recruitmentApplications.stage,
        interviewScheduledAt: recruitmentApplications.interviewScheduledAt,
        interviewLocationOrLink: recruitmentApplications.interviewLocationOrLink,
        offerTermsSummary: recruitmentApplications.offerTermsSummary,
        stageNotes: recruitmentApplications.stageNotes,
        createdAt: recruitmentApplications.createdAt,
        updatedAt: recruitmentApplications.updatedAt,
      })
      .from(recruitmentApplications)
      .where(eq(recruitmentApplications.applicantUserId, req.authUser!.userId))
      .orderBy(desc(recruitmentApplications.updatedAt));

    res.json({ applications: myApps, stages: RECRUITMENT_STAGES });
  } catch (err) {
    console.error('My applications error:', err);
    res.status(500).json({ error: 'Unable to load your application status.' });
  }
});

// =========================================================================
// ALL SUBSEQUENT ROUTES REQUIRE AUTHENTICATION & AUTHORISED ACCESS
// =========================================================================
staffRouter.use(requireAuth);

// 2. JOB DESCRIPTION REVISIONS (HR Edit + Mandatory Independent Two-Person Approval)
staffRouter.get('/revisions', async (req: AuthRequest, res) => {
  if (!hasAdminStaffAccess(req)) {
    return res.status(403).json({ error: 'Authorised staff privileges required.' });
  }
  const rows = await db
    .select()
    .from(staffPositionRevisions)
    .orderBy(desc(staffPositionRevisions.createdAt))
    .limit(50);
  res.json({ revisions: rows });
});

staffRouter.post('/positions/:jobId/revisions', requirePrivilegedMfa, async (req: AuthRequest, res) => {
  try {
    if (isAuditorOnly(req)) {
      return res.status(403).json({ error: 'Auditors cannot modify job descriptions.' });
    }
    if (!hasHrAuthority(req)) {
      return res.status(403).json({ error: 'Only HR Officers or Super Admin may propose Job Description revisions.' });
    }

    const schema = z.object({
      jobDescription: z.string().min(20).optional(),
      requiredQualifications: z.string().min(10).optional(),
      professionalQualifications: z.string().min(5).optional(),
      requiredExperience: z.string().min(5).optional(),
      geographicalJurisdiction: z.string().min(3).optional(),
      performanceExpectations: z.string().min(10).optional(),
      revisionNote: z.string().min(5).max(500),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Valid proposed JD fields and revision note (min 5 chars) required.' });
    }

    const jobId = String(req.params.jobId).toUpperCase();
    const [pos] = await db.select().from(staffPositions).where(eq(staffPositions.jobId, jobId)).limit(1);
    if (!pos) return res.status(404).json({ error: 'Position not found.' });

    const { revisionNote, ...changes } = parsed.data;
    const [rev] = await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(staffPositionRevisions)
        .values({
          positionId: pos.id,
          jobId: pos.jobId,
          proposedChangesJson: changes,
          revisionNote,
          status: 'PENDING_APPROVAL',
          proposedBy: req.authUser!.userId,
        })
        .returning();

      await tx
        .update(staffPositions)
        .set({
          revisionStatus: 'PENDING_APPROVAL',
          lastRevisedBy: req.authUser!.userId,
          updatedAt: new Date(),
        })
        .where(eq(staffPositions.id, pos.id));
      return inserted;
    });

    await writeAuditLog({
      actorUserId: req.authUser!.userId,
      actorRole: req.authUser!.activeRole,
      action: 'STAFF_JD_REVISION_PROPOSED',
      entityType: 'staff_position_revisions',
      entityId: rev.id,
      ip: req.ip,
      details: { jobId, revisionNote },
    });

    res.status(201).json({ revision: rev });
  } catch (err) {
    console.error('Propose JD revision error:', err);
    res.status(500).json({ error: 'Unable to propose JD revision.' });
  }
});

staffRouter.post('/revisions/:revisionId/decide', requirePrivilegedMfa, async (req: AuthRequest, res) => {
  try {
    if (isAuditorOnly(req)) {
      return res.status(403).json({ error: 'Auditors hold read-only review access.' });
    }
    if (!hasHrAuthority(req)) {
      return res.status(403).json({ error: 'Authorised HR or Super Admin approval required.' });
    }

    const { decision } = req.body as { decision?: 'APPROVED' | 'REJECTED' };
    if (decision !== 'APPROVED' && decision !== 'REJECTED') {
      return res.status(400).json({ error: 'Decision must be APPROVED or REJECTED.' });
    }

    const revisionId = String(req.params.revisionId);
    const [rev] = await db
      .select()
      .from(staffPositionRevisions)
      .where(eq(staffPositionRevisions.id, revisionId))
      .limit(1);
    if (!rev) return res.status(404).json({ error: 'Revision record not found.' });
    if (rev.status !== 'PENDING_APPROVAL') {
      return res.status(400).json({ error: 'This revision has already been decided.' });
    }

    // Two-Person Separation of Duties: Proposer cannot approve their own JD edit
    if (rev.proposedBy === req.authUser!.userId) {
      return res.status(403).json({
        error: 'Separation of duties enforced: you cannot approve or reject a job description revision that you proposed.',
      });
    }

    const changes = rev.proposedChangesJson as Record<string, string>;
    await db.transaction(async (tx) => {
      await tx
        .update(staffPositionRevisions)
        .set({
          status: decision,
          reviewedBy: req.authUser!.userId,
          reviewedAt: new Date(),
        })
        .where(eq(staffPositionRevisions.id, rev.id));

      if (decision === 'APPROVED') {
        await tx
          .update(staffPositions)
          .set({
            ...(changes.jobDescription ? { jobDescription: changes.jobDescription } : {}),
            ...(changes.requiredQualifications ? { requiredQualifications: changes.requiredQualifications } : {}),
            ...(changes.professionalQualifications ? { professionalQualifications: changes.professionalQualifications } : {}),
            ...(changes.requiredExperience ? { requiredExperience: changes.requiredExperience } : {}),
            ...(changes.geographicalJurisdiction ? { geographicalJurisdiction: changes.geographicalJurisdiction } : {}),
            ...(changes.performanceExpectations ? { performanceExpectations: changes.performanceExpectations } : {}),
            revisionStatus: 'APPROVED',
            revisionVersion: sql`${staffPositions.revisionVersion} + 1`,
            lastApprovedBy: req.authUser!.userId,
            updatedAt: new Date(),
          })
          .where(eq(staffPositions.id, rev.positionId));
      } else {
        await tx
          .update(staffPositions)
          .set({ revisionStatus: 'APPROVED', updatedAt: new Date() })
          .where(eq(staffPositions.id, rev.positionId));
      }
    });

    await writeAuditLog({
      actorUserId: req.authUser!.userId,
      actorRole: req.authUser!.activeRole,
      action: `STAFF_JD_REVISION_${decision}`,
      entityType: 'staff_position_revisions',
      entityId: rev.id,
      ip: req.ip,
      details: { jobId: rev.jobId },
    });

    res.json({ decided: true, decision });
  } catch (err) {
    console.error('Decide JD revision error:', err);
    res.status(500).json({ error: 'Unable to record JD revision decision.' });
  }
});

// 3. ORGANISATIONAL LEADERSHIP: Supervisors, Reassignments, Acting Officers, County Scope
staffRouter.post('/positions/:jobId/leadership', requirePrivilegedMfa, async (req: AuthRequest, res) => {
  try {
    if (isAuditorOnly(req)) {
      return res.status(403).json({ error: 'Auditors hold read-only audit access.' });
    }
    if (!hasHrAuthority(req)) {
      return res.status(403).json({ error: 'Only Super Admin or HR Officers may reassign reporting lines or appoint acting officers.' });
    }

    const schema = z.object({
      reportsToJobId: z.string().nullable().optional(),
      reportingOfficer: z.string().min(3).optional(),
      geographicalJurisdiction: z.string().min(3).optional(),
      incumbentName: z.string().nullable().optional(),
      incumbentUserId: z.string().uuid().nullable().optional(),
      actingOfficerName: z.string().nullable().optional(),
      actingOfficerUserId: z.string().uuid().nullable().optional(),
      vacancyStatus: z.enum(['FILLED', 'VACANT', 'ACTING', 'RECRUITING']).optional(),
      reason: z.string().min(5).max(500),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Valid leadership assignment parameters and documented reason (min 5 chars) required.' });
    }
    const d = parsed.data;
    const jobId = String(req.params.jobId).toUpperCase();

    // Anti-self-approval rule
    if (
      (d.incumbentUserId && d.incumbentUserId === req.authUser!.userId) ||
      (d.actingOfficerUserId && d.actingOfficerUserId === req.authUser!.userId)
    ) {
      return res.status(403).json({
        error: 'Conflict-of-interest prohibition: a staff member cannot approve their own appointment or acting assignment.',
      });
    }

    const allPos = await db.select().from(staffPositions);
    const target = allPos.find((p) => p.jobId === jobId);
    if (!target) return res.status(404).json({ error: 'Position not found.' });

    let nextReportingOfficer = d.reportingOfficer || target.reportingOfficer;
    if (d.reportsToJobId !== undefined) {
      if (d.reportsToJobId === jobId) {
        return res.status(400).json({ error: 'A position cannot report to itself.' });
      }
      if (d.reportsToJobId) {
        const supervisor = allPos.find((p) => p.jobId === d.reportsToJobId);
        if (!supervisor) return res.status(404).json({ error: 'Selected supervisor jobId does not exist.' });
        // Cycle detection in reporting chain
        const parentMap = new Map(allPos.map((p) => [p.jobId, p.reportsToJobId]));
        parentMap.set(jobId, d.reportsToJobId);
        let cursor: string | null | undefined = d.reportsToJobId;
        const visited = new Set<string>([jobId]);
        while (cursor) {
          if (visited.has(cursor)) {
            return res.status(400).json({ error: 'Circular reporting hierarchy detected — supervisor change rejected.' });
          }
          visited.add(cursor);
          cursor = parentMap.get(cursor);
        }
        if (!d.reportingOfficer) {
          nextReportingOfficer = `${supervisor.jobTitle} (${supervisor.jobId})`;
        }
      }
    }

    const [updated] = await db
      .update(staffPositions)
      .set({
        ...(d.reportsToJobId !== undefined ? { reportsToJobId: d.reportsToJobId } : {}),
        reportingOfficer: nextReportingOfficer,
        ...(d.geographicalJurisdiction ? { geographicalJurisdiction: d.geographicalJurisdiction } : {}),
        ...(d.incumbentName !== undefined ? { incumbentName: d.incumbentName } : {}),
        ...(d.incumbentUserId !== undefined ? { incumbentUserId: d.incumbentUserId } : {}),
        ...(d.actingOfficerName !== undefined ? { actingOfficerName: d.actingOfficerName } : {}),
        ...(d.actingOfficerUserId !== undefined ? { actingOfficerUserId: d.actingOfficerUserId } : {}),
        ...(d.vacancyStatus ? { vacancyStatus: d.vacancyStatus } : {}),
        updatedAt: new Date(),
      })
      .where(eq(staffPositions.jobId, jobId))
      .returning();

    await writeAuditLog({
      actorUserId: req.authUser!.userId,
      actorRole: req.authUser!.activeRole,
      action: 'ORG_LEADERSHIP_UPDATED',
      entityType: 'staff_positions',
      entityId: target.id,
      ip: req.ip,
      details: { jobId, reason: d.reason, reportsToJobId: updated.reportsToJobId, vacancyStatus: updated.vacancyStatus },
    });

    res.json({ position: sanitizePublicPosition(updated) });
  } catch (err) {
    console.error('Update leadership error:', err);
    res.status(500).json({ error: 'Unable to update organisational reporting structure.' });
  }
});

// 4. RECRUITMENT, VACANCIES & 15-STAGE STAFF APPOINTMENT CENTRE
staffRouter.get('/recruitment', async (req: AuthRequest, res) => {
  try {
    if (!hasRecruitmentReadAuthority(req)) {
      return res.status(403).json({
        error: 'Applicant PII is strictly protected. Only authorised HR Officers, Super Admin, or Auditors may access recruitment dossiers.',
      });
    }

    const [vacancies, apps] = await Promise.all([
      db.select().from(staffVacancies).orderBy(desc(staffVacancies.createdAt)),
      db.select().from(recruitmentApplications).orderBy(desc(recruitmentApplications.updatedAt)),
    ]);

    const auditorMask = isAuditorOnly(req);
    const decryptedApps = apps.map((a) => {
      const fullName = decryptSensitiveText(a.applicantNameEnc);
      const email = decryptSensitiveText(a.applicantEmailEnc);
      const phone = decryptSensitiveText(a.applicantPhoneEnc);
      return {
        id: a.id,
        applicationRef: a.applicationRef,
        vacancyId: a.vacancyId,
        jobId: a.jobId,
        applicantUserId: a.applicantUserId,
        applicantName: auditorMask ? `${fullName.slice(0, 2)}*** (Audit Masked)` : fullName,
        applicantEmail: auditorMask ? `***@${email.split('@')[1] || 'hidden'}` : email,
        applicantPhone: auditorMask ? '***-PROTECTED' : phone,
        county: a.county,
        academicSummary: a.academicSummary,
        professionalCertsSummary: a.professionalCertsSummary,
        experienceYears: a.experienceYears,
        coverNote: a.coverNote,
        documentsJson: a.documentsJson,
        stage: a.stage,
        interviewScheduledAt: a.interviewScheduledAt,
        interviewLocationOrLink: a.interviewLocationOrLink,
        interviewScore: a.interviewScore,
        interviewAssessmentNotes: a.interviewAssessmentNotes,
        referenceCheckStatus: a.referenceCheckStatus,
        referenceCheckNotes: a.referenceCheckNotes,
        backgroundCheckStatus: a.backgroundCheckStatus,
        backgroundCheckNotes: a.backgroundCheckNotes,
        offerTermsSummary: a.offerTermsSummary,
        offerIssuedAt: a.offerIssuedAt,
        offerAcceptedAt: a.offerAcceptedAt,
        proposedAppointmentBy: a.proposedAppointmentBy,
        appointmentApprovedBy: a.appointmentApprovedBy,
        appointmentApprovedAt: a.appointmentApprovedAt,
        stageNotes: a.stageNotes,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
      };
    });

    res.json({
      vacancies,
      applications: decryptedApps,
      stages: RECRUITMENT_STAGES,
      negativeStatuses: APPLICATION_NEGATIVE_STATUSES,
    });
  } catch (err) {
    console.error('Recruitment load error:', err);
    res.status(500).json({ error: 'Unable to load recruitment centre.' });
  }
});

staffRouter.post('/recruitment/vacancies', requirePrivilegedMfa, async (req: AuthRequest, res) => {
  try {
    if (isAuditorOnly(req)) {
      return res.status(403).json({ error: 'Auditors cannot create or publish vacancies.' });
    }
    if (!hasHrAuthority(req)) {
      return res.status(403).json({ error: 'HR Department authorisation required to create vacancies.' });
    }

    const schema = z.object({
      jobId: z.string().min(4),
      jobLocation: z.string().min(2),
      employmentType: z.enum(['FULL_TIME', 'CONTRACT', 'PART_TIME', 'VOLUNTEER', 'SECONDMENT']).default('FULL_TIME'),
      jobDescription: z.string().min(20),
      academicQualifications: z.string().min(5),
      professionalRequirements: z.string().min(5),
      experienceRequirements: z.string().min(5),
      applicationDeadline: z.string(),
      requiredDocuments: z.array(z.string()).min(1),
      applicationInstructions: z.string().min(10),
      initialStage: z.enum(['VACANCY_DRAFT', 'PUBLISHED']).default('VACANCY_DRAFT'),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'All required 12 vacancy fields must be completed.' });
    }
    const d = parsed.data;
    const [pos] = await db
      .select()
      .from(staffPositions)
      .where(eq(staffPositions.jobId, d.jobId.toUpperCase()))
      .limit(1);
    if (!pos) return res.status(404).json({ error: 'Approved organisational position not found.' });

    const deadlineDate = new Date(d.applicationDeadline);
    if (Number.isNaN(deadlineDate.getTime())) {
      return res.status(400).json({ error: 'Valid application deadline date is required.' });
    }

    const vacancyCode = `VAC-${pos.jobId}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    const isPublished = d.initialStage === 'PUBLISHED';

    const created = await db.transaction(async (tx) => {
      const [vac] = await tx
        .insert(staffVacancies)
        .values({
          vacancyCode,
          positionId: pos.id,
          jobId: pos.jobId,
          jobTitle: pos.jobTitle,
          departmentNumber: pos.departmentNumber,
          department: pos.department,
          jobLocation: d.jobLocation,
          employmentType: d.employmentType,
          jobDescription: d.jobDescription,
          academicQualifications: d.academicQualifications,
          professionalRequirements: d.professionalRequirements,
          experienceRequirements: d.experienceRequirements,
          applicationDeadline: deadlineDate,
          requiredDocuments: d.requiredDocuments,
          applicationInstructions: d.applicationInstructions,
          stage: d.initialStage,
          createdBy: req.authUser!.userId,
          approvedBy: isPublished ? req.authUser!.userId : null,
          publishedAt: isPublished ? new Date() : null,
        })
        .returning();

      if (isPublished) {
        await tx
          .update(staffPositions)
          .set({
            isVacancyPublished: true,
            vacancyPublishedAt: new Date(),
            vacancyStatus: pos.vacancyStatus === 'VACANT' ? 'RECRUITING' : pos.vacancyStatus,
            updatedAt: new Date(),
          })
          .where(eq(staffPositions.id, pos.id));
      }
      return vac;
    });

    await writeAuditLog({
      actorUserId: req.authUser!.userId,
      actorRole: req.authUser!.activeRole,
      action: `VACANCY_${d.initialStage}`,
      entityType: 'staff_vacancies',
      entityId: created.id,
      ip: req.ip,
      details: { vacancyCode, jobId: pos.jobId },
    });

    res.status(201).json({ vacancy: created });
  } catch (err) {
    console.error('Create vacancy error:', err);
    res.status(500).json({ error: 'Unable to create vacancy.' });
  }
});

staffRouter.patch('/recruitment/vacancies/:id/stage', requirePrivilegedMfa, async (req: AuthRequest, res) => {
  try {
    if (isAuditorOnly(req) || !hasHrAuthority(req)) {
      return res.status(403).json({ error: 'HR authority required to transition vacancy stage.' });
    }
    const { stage } = req.body as { stage?: 'VACANCY_DRAFT' | 'VACANCY_APPROVED' | 'PUBLISHED' | 'CLOSED' };
    if (!stage) return res.status(400).json({ error: 'Vacancy stage is required.' });

    const [vac] = await db
      .select()
      .from(staffVacancies)
      .where(eq(staffVacancies.id, String(req.params.id)))
      .limit(1);
    if (!vac) return res.status(404).json({ error: 'Vacancy not found.' });

    const [updated] = await db.transaction(async (tx) => {
      const rows = await tx
        .update(staffVacancies)
        .set({
          stage,
          approvedBy: stage === 'VACANCY_APPROVED' || stage === 'PUBLISHED' ? req.authUser!.userId : vac.approvedBy,
          publishedAt: stage === 'PUBLISHED' ? new Date() : vac.publishedAt,
          updatedAt: new Date(),
        })
        .where(eq(staffVacancies.id, vac.id))
        .returning();

      await tx
        .update(staffPositions)
        .set({
          isVacancyPublished: stage === 'PUBLISHED',
          vacancyPublishedAt: stage === 'PUBLISHED' ? new Date() : null,
          vacancyStatus: stage === 'PUBLISHED' ? 'RECRUITING' : 'VACANT',
          updatedAt: new Date(),
        })
        .where(eq(staffPositions.id, vac.positionId));
      return rows;
    });

    await writeAuditLog({
      actorUserId: req.authUser!.userId,
      actorRole: req.authUser!.activeRole,
      action: `VACANCY_STAGE_${stage}`,
      entityType: 'staff_vacancies',
      entityId: vac.id,
      ip: req.ip,
      details: { vacancyCode: vac.vacancyCode, jobId: vac.jobId },
    });

    res.json({ vacancy: updated });
  } catch (err) {
    console.error('Vacancy stage update error:', err);
    res.status(500).json({ error: 'Unable to update vacancy stage.' });
  }
});

staffRouter.patch('/recruitment/applications/:id/stage', requirePrivilegedMfa, async (req: AuthRequest, res) => {
  try {
    if (isAuditorOnly(req) || !hasHrAuthority(req)) {
      return res.status(403).json({ error: 'HR authority required to evaluate applicants.' });
    }

    const schema = z.object({
      stage: z.enum([
        'APPLICATIONS_RECEIVED',
        'INITIAL_SCREENING',
        'SHORTLISTED',
        'INTERVIEW',
        'REFERENCE_CHECKS',
        'BACKGROUND_SUITABILITY',
        'SELECTION',
        'OFFER_ISSUED',
        'OFFER_ACCEPTED',
        'APPOINTMENT_APPROVED',
        'ONBOARDING',
        'ACTIVE_EMPLOYEE',
        'UNSUCCESSFUL',
        'WITHDRAWN',
        'REJECTED',
      ]),
      stageNotes: z.string().optional(),
      interviewScheduledAt: z.string().optional(),
      interviewLocationOrLink: z.string().optional(),
      interviewScore: z.number().int().min(0).max(100).optional(),
      interviewAssessmentNotes: z.string().optional(),
      referenceCheckStatus: z.enum(['PENDING', 'VERIFIED', 'FLAGGED']).optional(),
      referenceCheckNotes: z.string().optional(),
      backgroundCheckStatus: z.enum(['PENDING', 'CLEARED', 'FLAGGED']).optional(),
      backgroundCheckNotes: z.string().optional(),
      offerTermsSummary: z.string().optional(),
      verifyAllDocuments: z.boolean().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Valid application stage payload required.' });
    }
    const d = parsed.data;
    const appId = String(req.params.id);

    const [existing] = await db
      .select()
      .from(recruitmentApplications)
      .where(eq(recruitmentApplications.id, appId))
      .limit(1);
    if (!existing) return res.status(404).json({ error: 'Application not found.' });

    // Anti-self-approval: an applicant cannot approve their own appointment, and proposer cannot unilaterally sign final appointment
    if (existing.applicantUserId && existing.applicantUserId === req.authUser!.userId) {
      return res.status(403).json({ error: 'A staff member cannot evaluate or approve their own job application.' });
    }
    if (
      d.stage === 'APPOINTMENT_APPROVED' &&
      existing.proposedAppointmentBy &&
      existing.proposedAppointmentBy === req.authUser!.userId
    ) {
      return res.status(403).json({
        error: 'Dual Appointment Approval enforced: the officer who proposed Selection/Offer cannot be the sole officer approving the final appointment.',
      });
    }

    const [vacancy] = await db
      .select()
      .from(staffVacancies)
      .where(eq(staffVacancies.id, existing.vacancyId))
      .limit(1);
    const [pos] = await db
      .select()
      .from(staffPositions)
      .where(eq(staffPositions.jobId, existing.jobId))
      .limit(1);

    const nextDocs = d.verifyAllDocuments
      ? existing.documentsJson.map((doc) => ({ ...doc, verified: true }))
      : existing.documentsJson;

    const updatedApp = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(recruitmentApplications)
        .set({
          stage: d.stage,
          stageNotes: d.stageNotes ?? existing.stageNotes,
          documentsJson: nextDocs,
          ...(d.interviewScheduledAt ? { interviewScheduledAt: new Date(d.interviewScheduledAt) } : {}),
          ...(d.interviewLocationOrLink !== undefined ? { interviewLocationOrLink: d.interviewLocationOrLink } : {}),
          ...(d.interviewScore !== undefined ? { interviewScore: d.interviewScore } : {}),
          ...(d.interviewAssessmentNotes !== undefined ? { interviewAssessmentNotes: d.interviewAssessmentNotes } : {}),
          ...(d.referenceCheckStatus ? { referenceCheckStatus: d.referenceCheckStatus } : {}),
          ...(d.referenceCheckNotes !== undefined ? { referenceCheckNotes: d.referenceCheckNotes } : {}),
          ...(d.backgroundCheckStatus ? { backgroundCheckStatus: d.backgroundCheckStatus } : {}),
          ...(d.backgroundCheckNotes !== undefined ? { backgroundCheckNotes: d.backgroundCheckNotes } : {}),
          ...(d.offerTermsSummary !== undefined ? { offerTermsSummary: d.offerTermsSummary } : {}),
          ...(d.stage === 'OFFER_ISSUED' ? { offerIssuedAt: new Date() } : {}),
          ...(d.stage === 'OFFER_ACCEPTED' ? { offerAcceptedAt: new Date() } : {}),
          ...(d.stage === 'SELECTION' || d.stage === 'OFFER_ISSUED'
            ? { proposedAppointmentBy: req.authUser!.userId }
            : {}),
          ...(d.stage === 'APPOINTMENT_APPROVED'
            ? { appointmentApprovedBy: req.authUser!.userId, appointmentApprovedAt: new Date() }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(recruitmentApplications.id, existing.id))
        .returning();

      // At Stage 15 ACTIVE_EMPLOYEE, appoint real incumbent to staff_employee_profiles & staff_positions
      if (d.stage === 'ACTIVE_EMPLOYEE' && pos) {
        const decName = decryptSensitiveText(existing.applicantNameEnc);
        const decEmail = decryptSensitiveText(existing.applicantEmailEnc);
        const decPhone = decryptSensitiveText(existing.applicantPhoneEnc);
        const staffNumber = `HC-STF-${new Date().getFullYear()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

        const [existingProfile] = await tx
          .select()
          .from(staffEmployeeProfiles)
          .where(eq(staffEmployeeProfiles.jobId, pos.jobId))
          .limit(1);

        if (!existingProfile) {
          await tx.insert(staffEmployeeProfiles).values({
            staffNumber,
            userId: existing.applicantUserId || null,
            positionId: pos.id,
            jobId: pos.jobId,
            fullLegalName: decName,
            contactEmail: decEmail,
            contactPhone: decPhone,
            departmentNumber: pos.departmentNumber,
            department: pos.department,
            jobTitle: pos.jobTitle,
            countyAssignment: existing.county,
            employmentCategory: vacancy?.employmentType || 'FULL_TIME',
            appointmentDate: new Date().toISOString().slice(0, 10),
            employmentStatus: 'ACTIVE',
            academicQualifications: existing.academicSummary,
            professionalCertifications: existing.professionalCertsSummary,
            workExperienceSummary: `${existing.experienceYears} years verified humanitarian/professional experience`,
            supervisorName: pos.reportingOfficer,
            assignedResponsibilities: pos.mainResponsibilities,
            emergencyContactName: 'To be completed during Onboarding Checklist',
            emergencyContactPhone: decPhone,
            emergencyContactRelation: 'Pending HR Verification',
            appointmentDocuments: [
              {
                title: `Letter of Appointment — ${pos.jobTitle}`,
                issuedAt: new Date().toISOString().slice(0, 10),
                refNo: existing.applicationRef,
              },
            ],
          });
        }

        await tx
          .update(staffPositions)
          .set({
            incumbentName: decName,
            incumbentUserId: existing.applicantUserId || null,
            vacancyStatus: 'FILLED',
            isVacancyPublished: false,
            updatedAt: new Date(),
          })
          .where(eq(staffPositions.id, pos.id));
      }

      // Automated Onboarding Trigger: create Onboarding Progress Tracker at Stage 13 (APPOINTMENT_APPROVED) or 14 (ONBOARDING)
      if (
        (d.stage === 'APPOINTMENT_APPROVED' || d.stage === 'ONBOARDING' || d.stage === 'ACTIVE_EMPLOYEE') &&
        pos
      ) {
        const [existingOnb] = await tx
          .select()
          .from(staffOnboardingChecklists)
          .where(eq(staffOnboardingChecklists.applicationId, existing.id))
          .limit(1);

        if (!existingOnb) {
          const allDocsVerified =
            existing.documentsJson.length > 0 && existing.documentsJson.every((doc) => doc.verified);
          const milestones = buildDefaultOnboardingMilestones({
            jobId: pos.jobId,
            jobTitle: pos.jobTitle,
            department: pos.department,
            requiredQualifications: pos.requiredQualifications,
            professionalQualifications: pos.professionalQualifications,
            safeguardingResponsibilities: pos.safeguardingResponsibilities,
            applicationDocsVerified: Boolean(d.verifyAllDocuments || allDocsVerified),
            backgroundCleared: (d.backgroundCheckStatus || existing.backgroundCheckStatus) === 'CLEARED',
          });
          const progress = computeOnboardingProgress(milestones, false);
          const onbRef = `ONB-${new Date().getFullYear()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
          const due = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

          await tx.insert(staffOnboardingChecklists).values({
            onboardingRef: onbRef,
            applicationId: existing.id,
            userId: existing.applicantUserId || null,
            jobId: pos.jobId,
            departmentNumber: pos.departmentNumber,
            department: pos.department,
            jobTitle: pos.jobTitle,
            newHireNameEnc: existing.applicantNameEnc,
            newHireEmailEnc: existing.applicantEmailEnc,
            overallStatus: progress.overallStatus,
            completionPct: progress.completionPct,
            dueDate: due,
            milestonesJson: milestones,
            createdByUserId: req.authUser!.userId,
          });
        }
      }

      if (existing.applicantUserId) {
        await tx.insert(notifications).values({
          userId: existing.applicantUserId,
          category: 'SYSTEM',
          title: `Application ${existing.applicationRef}: ${d.stage.replace(/_/g, ' ')}`,
          body: `Your recruitment application for ${vacancy?.jobTitle || existing.jobId} is now at stage: ${d.stage.replace(/_/g, ' ')}.${d.stageNotes ? ` Note: ${d.stageNotes}` : ''}`,
        });
      }

      return row;
    });

    await writeAuditLog({
      actorUserId: req.authUser!.userId,
      actorRole: req.authUser!.activeRole,
      action: d.stage === 'APPOINTMENT_APPROVED' ? 'STAFF_APPOINTMENT_APPROVED' : `RECRUITMENT_STAGE_${d.stage}`,
      entityType: 'recruitment_applications',
      entityId: existing.id,
      ip: req.ip,
      details: { applicationRef: existing.applicationRef, jobId: existing.jobId, stage: d.stage },
    });

    res.json({ application: updatedApp });
  } catch (err) {
    console.error('Update application stage error:', err);
    res.status(500).json({ error: 'Unable to update application stage.' });
  }
});

// 5. STAFF PROFILE & EMPLOYEE MANAGEMENT CENTRE + RESTRICTED DISCIPLINARY RECORDS
staffRouter.get('/profiles', async (req: AuthRequest, res) => {
  try {
    const canSeeFull = hasRecruitmentReadAuthority(req);
    const profiles = await db
      .select()
      .from(staffEmployeeProfiles)
      .orderBy(staffEmployeeProfiles.departmentNumber, staffEmployeeProfiles.fullLegalName);

    if (canSeeFull) {
      return res.json({ profiles, employmentStatuses: STAFF_EMPLOYMENT_STATUSES });
    }

    // Standard authenticated officers/staff see their own full profile + non-sensitive colleague directory info only
    const filtered = profiles.map((p) => {
      if (p.userId === req.authUser!.userId) return p;
      return {
        id: p.id,
        staffNumber: p.staffNumber,
        jobId: p.jobId,
        fullLegalName: p.fullLegalName,
        officialPhotoUrl: p.officialPhotoUrl,
        departmentNumber: p.departmentNumber,
        department: p.department,
        jobTitle: p.jobTitle,
        countyAssignment: p.countyAssignment,
        employmentCategory: p.employmentCategory,
        employmentStatus: p.employmentStatus,
        supervisorName: p.supervisorName,
        assignedResponsibilities: p.assignedResponsibilities,
      };
    });
    res.json({ profiles: filtered, employmentStatuses: STAFF_EMPLOYMENT_STATUSES });
  } catch (err) {
    console.error('Load staff profiles error:', err);
    res.status(500).json({ error: 'Unable to load staff profiles.' });
  }
});

staffRouter.post('/profiles', requirePrivilegedMfa, async (req: AuthRequest, res) => {
  try {
    if (isAuditorOnly(req) || !hasHrAuthority(req)) {
      return res.status(403).json({ error: 'HR Officer or Super Admin authorisation required to appoint staff.' });
    }

    const schema = z.object({
      jobId: z.string().min(4),
      userId: z.string().uuid().optional().nullable(),
      fullLegalName: z.string().min(3),
      officialPhotoUrl: z.string().optional().nullable(),
      contactEmail: z.string().email(),
      contactPhone: z.string().min(8),
      countyAssignment: z.string().default('Nairobi'),
      subCountyAssignment: z.string().optional(),
      wardAssignment: z.string().optional(),
      countryCode: z.string().default('KE'),
      internationalRegion: z.string().optional(),
      employmentCategory: z.enum(['PERMANENT', 'FIXED_TERM', 'CONTRACT', 'CONSULTANT', 'VOLUNTEER', 'FELLOW']).default('PERMANENT'),
      genderMarker: z.enum(['FEMALE', 'MALE', 'NON_BINARY', 'PREFER_NOT_TO_SAY']).optional(),
      appointmentDate: z.string(),
      employmentStatus: z.enum(STAFF_EMPLOYMENT_STATUSES).default('ACTIVE'),
      academicQualifications: z.string().min(5),
      professionalCertifications: z.string().min(3),
      workExperienceSummary: z.string().min(5),
      emergencyContactName: z.string().min(2),
      emergencyContactPhone: z.string().min(8),
      emergencyContactRelation: z.string().min(2),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Complete official staff profile fields required.' });
    }
    const d = parsed.data;

    if (d.userId && d.userId === req.authUser!.userId) {
      return res.status(403).json({
        error: 'Anti-self-approval rule: you cannot create or approve your own staff appointment.',
      });
    }

    const [pos] = await db
      .select()
      .from(staffPositions)
      .where(eq(staffPositions.jobId, d.jobId.toUpperCase()))
      .limit(1);
    if (!pos) return res.status(404).json({ error: 'Approved organisational position not found.' });

    const staffNumber = `HC-STF-${new Date().getFullYear()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    const created = await db.transaction(async (tx) => {
      const [profile] = await tx
        .insert(staffEmployeeProfiles)
        .values({
          staffNumber,
          userId: d.userId || null,
          positionId: pos.id,
          jobId: pos.jobId,
          fullLegalName: d.fullLegalName.trim(),
          officialPhotoUrl: d.officialPhotoUrl || null,
          contactEmail: d.contactEmail.trim().toLowerCase(),
          contactPhone: d.contactPhone.trim(),
          departmentNumber: pos.departmentNumber,
          department: pos.department,
          jobTitle: pos.jobTitle,
          countyAssignment: d.countyAssignment,
          subCountyAssignment: d.subCountyAssignment || null,
          wardAssignment: d.wardAssignment || null,
          countryCode: d.countryCode,
          internationalRegion: d.internationalRegion || null,
          employmentCategory: d.employmentCategory,
          genderMarker: d.genderMarker || null,
          appointmentDate: d.appointmentDate,
          employmentStatus: d.employmentStatus,
          academicQualifications: d.academicQualifications,
          professionalCertifications: d.professionalCertifications,
          workExperienceSummary: d.workExperienceSummary,
          supervisorName: pos.reportingOfficer,
          assignedResponsibilities: pos.mainResponsibilities,
          emergencyContactName: d.emergencyContactName,
          emergencyContactPhone: d.emergencyContactPhone,
          emergencyContactRelation: d.emergencyContactRelation,
          appointmentDocuments: [
            {
              title: `Official Appointment Letter — ${pos.jobTitle}`,
              issuedAt: d.appointmentDate,
              refNo: staffNumber,
            },
          ],
        })
        .returning();

      if (d.employmentStatus === 'ACTIVE') {
        await tx
          .update(staffPositions)
          .set({
            incumbentName: d.fullLegalName.trim(),
            incumbentUserId: d.userId || null,
            vacancyStatus: 'FILLED',
            isVacancyPublished: false,
            updatedAt: new Date(),
          })
          .where(eq(staffPositions.id, pos.id));
      }

      // Automated Onboarding Trigger when creating a new appointed/pending staff profile
      if (d.employmentStatus === 'PENDING_APPOINTMENT' || d.employmentStatus === 'ACTIVE') {
        const milestones = buildDefaultOnboardingMilestones({
          jobId: pos.jobId,
          jobTitle: pos.jobTitle,
          department: pos.department,
          requiredQualifications: pos.requiredQualifications,
          professionalQualifications: pos.professionalQualifications,
          safeguardingResponsibilities: pos.safeguardingResponsibilities,
        });
        const progress = computeOnboardingProgress(milestones, false);
        const onbRef = `ONB-${new Date().getFullYear()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
        await tx.insert(staffOnboardingChecklists).values({
          onboardingRef: onbRef,
          staffProfileId: profile.id,
          userId: d.userId || null,
          jobId: pos.jobId,
          departmentNumber: pos.departmentNumber,
          department: pos.department,
          jobTitle: pos.jobTitle,
          newHireNameEnc: encryptSensitiveText(d.fullLegalName.trim()),
          newHireEmailEnc: encryptSensitiveText(d.contactEmail.trim().toLowerCase()),
          overallStatus: progress.overallStatus,
          completionPct: progress.completionPct,
          dueDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
          milestonesJson: milestones,
          createdByUserId: req.authUser!.userId,
        });
      }

      return profile;
    });

    await writeAuditLog({
      actorUserId: req.authUser!.userId,
      actorRole: req.authUser!.activeRole,
      action: 'STAFF_PROFILE_CREATED',
      entityType: 'staff_employee_profiles',
      entityId: created.id,
      ip: req.ip,
      details: { staffNumber, jobId: pos.jobId },
    });

    res.status(201).json({ profile: created });
  } catch (err) {
    console.error('Create staff profile error:', err);
    res.status(500).json({ error: 'Unable to create staff profile.' });
  }
});

staffRouter.patch('/profiles/:id', requirePrivilegedMfa, async (req: AuthRequest, res) => {
  try {
    if (isAuditorOnly(req) || !hasHrAuthority(req)) {
      return res.status(403).json({ error: 'HR Officer or Super Admin authorisation required.' });
    }
    const profileId = String(req.params.id);
    const [existing] = await db
      .select()
      .from(staffEmployeeProfiles)
      .where(eq(staffEmployeeProfiles.id, profileId))
      .limit(1);
    if (!existing) return res.status(404).json({ error: 'Staff profile not found.' });

    const { actionType, countyAssignment, subCountyAssignment, newJobId, employmentStatus, exitOrTransferReason, trainingCourse, trainingProvider, leaveType, leaveStart, leaveEnd } =
      req.body as Record<string, any>;

    if (existing.userId && existing.userId === req.authUser!.userId && (actionType === 'PROMOTE' || actionType === 'EXIT')) {
      return res.status(403).json({ error: 'Anti-self-approval: you cannot approve your own promotion or exit status.' });
    }

    const patch: Record<string, any> = { updatedAt: new Date() };
    if (actionType === 'TRANSFER') {
      if (countyAssignment) patch.countyAssignment = countyAssignment;
      if (subCountyAssignment !== undefined) patch.subCountyAssignment = subCountyAssignment;
      patch.employmentStatus = employmentStatus || 'TRANSFERRED';
      patch.exitOrTransferReason = exitOrTransferReason || 'Official administrative transfer';
    } else if (actionType === 'PROMOTE' && newJobId) {
      const [newPos] = await db.select().from(staffPositions).where(eq(staffPositions.jobId, String(newJobId).toUpperCase())).limit(1);
      if (!newPos) return res.status(404).json({ error: 'Target promotion position not found.' });
      patch.positionId = newPos.id;
      patch.jobId = newPos.jobId;
      patch.jobTitle = newPos.jobTitle;
      patch.departmentNumber = newPos.departmentNumber;
      patch.department = newPos.department;
      patch.supervisorName = newPos.reportingOfficer;
      patch.promotionHistory = [
        ...existing.promotionHistory,
        {
          date: new Date().toISOString().slice(0, 10),
          fromTitle: existing.jobTitle,
          toTitle: newPos.jobTitle,
          approvedBy: req.authUser!.fullName,
        },
      ];
    } else if (actionType === 'RECORD_TRAINING' && trainingCourse) {
      patch.trainingHistory = [
        ...existing.trainingHistory,
        {
          date: new Date().toISOString().slice(0, 10),
          course: String(trainingCourse),
          provider: String(trainingProvider || 'Humanity Connect Academy'),
          status: 'COMPLETED',
        },
      ];
    } else if (actionType === 'RECORD_LEAVE' && leaveType && leaveStart && leaveEnd) {
      patch.leaveRecords = [
        ...existing.leaveRecords,
        {
          id: crypto.randomBytes(3).toString('hex').toUpperCase(),
          leaveType: String(leaveType),
          startDate: String(leaveStart),
          endDate: String(leaveEnd),
          status: 'APPROVED',
        },
      ];
      patch.employmentStatus = 'ON_LEAVE';
    } else if (actionType === 'EXIT') {
      const finalStatus = ['RESIGNED', 'RETIRED', 'TERMINATED'].includes(employmentStatus)
        ? employmentStatus
        : 'RESIGNED';
      patch.employmentStatus = finalStatus;
      patch.exitOrTransferReason = exitOrTransferReason || `Staff exit (${finalStatus})`;
    } else if (employmentStatus) {
      patch.employmentStatus = employmentStatus;
    }

    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(staffEmployeeProfiles)
        .set(patch)
        .where(eq(staffEmployeeProfiles.id, profileId))
        .returning();

      if (actionType === 'EXIT') {
        await tx
          .update(staffPositions)
          .set({ incumbentName: null, incumbentUserId: null, vacancyStatus: 'VACANT', updatedAt: new Date() })
          .where(eq(staffPositions.jobId, existing.jobId));
      } else if (actionType === 'PROMOTE' && patch.jobId) {
        await tx
          .update(staffPositions)
          .set({ incumbentName: null, incumbentUserId: null, vacancyStatus: 'VACANT', updatedAt: new Date() })
          .where(eq(staffPositions.jobId, existing.jobId));
        await tx
          .update(staffPositions)
          .set({ incumbentName: existing.fullLegalName, incumbentUserId: existing.userId, vacancyStatus: 'FILLED', updatedAt: new Date() })
          .where(eq(staffPositions.jobId, patch.jobId));
      }
      return row;
    });

    await writeAuditLog({
      actorUserId: req.authUser!.userId,
      actorRole: req.authUser!.activeRole,
      action: 'STAFF_PROFILE_UPDATED',
      entityType: 'staff_employee_profiles',
      entityId: profileId,
      ip: req.ip,
      details: { actionType: actionType || 'UPDATE', employmentStatus: updated.employmentStatus },
    });

    res.json({ profile: updated });
  } catch (err) {
    console.error('Update staff profile error:', err);
    res.status(500).json({ error: 'Unable to update staff profile.' });
  }
});

// Restricted Disciplinary Records (Encrypted + Self-Exclusion + HR/Safeguarding Separation)
staffRouter.get('/profiles/:id/disciplinary', async (req: AuthRequest, res) => {
  try {
    if (!hasHrAuthority(req) && !userCanViewSafeguardingCases(req.authUser!.roles, req.authUser!.permissions) && !isAuditorOnly(req)) {
      return res.status(403).json({ error: 'Restricted access: only authorised HR, Safeguarding, or Audit officers may view disciplinary records.' });
    }
    const profileId = String(req.params.id);
    const [profile] = await db
      .select()
      .from(staffEmployeeProfiles)
      .where(eq(staffEmployeeProfiles.id, profileId))
      .limit(1);
    if (!profile) return res.status(404).json({ error: 'Staff profile not found.' });

    if (profile.userId === req.authUser!.userId) {
      return res.status(403).json({ error: 'Independent oversight rule: a staff member cannot alter or preside over their own disciplinary investigation file.' });
    }

    const canSeeSg = userCanViewSafeguardingCases(req.authUser!.roles, req.authUser!.permissions);
    const rows = await db
      .select()
      .from(staffDisciplinaryRecords)
      .where(eq(staffDisciplinaryRecords.staffProfileId, profileId))
      .orderBy(desc(staffDisciplinaryRecords.createdAt));

    const visible = rows
      .filter((r) => canSeeSg || r.category !== 'SAFEGUARDING_REFERRAL')
      .map((r) => ({
        id: r.id,
        incidentRef: r.incidentRef,
        category: r.category,
        severity: r.severity,
        summary: decryptSensitiveText(r.summaryEnc),
        actionTaken: r.actionTaken,
        status: r.status,
        createdAt: r.createdAt,
        resolvedAt: r.resolvedAt,
      }));

    await writeAuditLog({
      actorUserId: req.authUser!.userId,
      actorRole: req.authUser!.activeRole,
      action: 'DISCIPLINARY_RECORD_ACCESSED',
      entityType: 'staff_employee_profiles',
      entityId: profileId,
      ip: req.ip,
      details: { recordsReturned: visible.length },
    });

    res.json({ records: visible });
  } catch (err) {
    console.error('Disciplinary read error:', err);
    res.status(500).json({ error: 'Unable to load restricted disciplinary records.' });
  }
});

staffRouter.post('/profiles/:id/disciplinary', requirePrivilegedMfa, async (req: AuthRequest, res) => {
  try {
    if (isAuditorOnly(req) || !hasHrAuthority(req)) {
      return res.status(403).json({ error: 'HR Officer or Super Admin authorisation required.' });
    }
    const profileId = String(req.params.id);
    const [profile] = await db
      .select()
      .from(staffEmployeeProfiles)
      .where(eq(staffEmployeeProfiles.id, profileId))
      .limit(1);
    if (!profile) return res.status(404).json({ error: 'Staff profile not found.' });
    if (profile.userId === req.authUser!.userId) {
      return res.status(403).json({ error: 'A staff member cannot log or approve their own disciplinary investigation.' });
    }

    const schema = z.object({
      category: z.enum(['CONDUCT', 'POLICY_BREACH', 'ATTENDANCE', 'SAFEGUARDING_REFERRAL']),
      severity: z.enum(['MINOR', 'MODERATE', 'SERIOUS', 'GROSS']),
      summary: z.string().min(10),
      actionTaken: z.string().min(5),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Valid disciplinary record details required.' });

    const ref = `DISC-${new Date().getFullYear()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    const [created] = await db
      .insert(staffDisciplinaryRecords)
      .values({
        staffProfileId: profileId,
        incidentRef: ref,
        category: parsed.data.category,
        severity: parsed.data.severity,
        summaryEnc: encryptSensitiveText(parsed.data.summary),
        actionTaken: parsed.data.actionTaken,
        status: 'OPEN',
        loggedByUserId: req.authUser!.userId,
      })
      .returning();

    res.status(201).json({ record: { ...created, summary: parsed.data.summary } });
  } catch (err) {
    console.error('Disciplinary create error:', err);
    res.status(500).json({ error: 'Unable to save disciplinary record.' });
  }
});

// 6. NATIONAL, 47-COUNTY & COMMUNITY FIELD PERSONNEL + INTERNATIONAL EXPANSION
staffRouter.get('/field-personnel', async (req: AuthRequest, res) => {
  try {
    if (!hasAdminStaffAccess(req)) {
      return res.status(403).json({ error: 'Authorised staff privileges required.' });
    }

    const [officers, profiles, cases, beneficiaries, projects, volunteers] = await Promise.all([
      db.select().from(fieldGeographyOfficers).orderBy(fieldGeographyOfficers.county, fieldGeographyOfficers.adminLevel),
      db.select().from(staffEmployeeProfiles),
      db.select().from(verificationCases),
      db.select().from(beneficiaryProfiles),
      db.select().from(communityProjects),
      db.select().from(volunteerAssignments),
    ]);

    const isNationalScope =
      req.authUser!.roles.includes('SUPER_ADMIN') ||
      req.authUser!.roles.includes('AUDITOR') ||
      req.authUser!.roles.includes('HR_OFFICER') ||
      req.authUser!.roles.includes('DATA_MANAGEMENT_OFFICER');

    // Enforce geographical jurisdiction isolation for County Representatives / Field Officers
    const myOfficerRow = officers.find((o) => o.userId === req.authUser!.userId);
    const allowedCounties = myOfficerRow
      ? new Set([myOfficerRow.county, ...myOfficerRow.additionalAuthorizedAreas].map((c) => c.toLowerCase()))
      : null;

    const visibleOfficers =
      isNationalScope || !allowedCounties
        ? officers
        : officers.filter((o) => allowedCounties.has(o.county.toLowerCase()));

    // Honest live County Dashboards across all 47 counties + International assignments
    const countyDashboards = KENYAN_47_COUNTIES.map((countyName) => {
      const cLower = countyName.toLowerCase();
      return {
        county: countyName,
        staffingCount:
          officers.filter((o) => o.countryCode === 'KE' && o.county.toLowerCase() === cLower).length +
          profiles.filter((p) => p.countryCode === 'KE' && p.countyAssignment.toLowerCase() === cLower && p.employmentStatus === 'ACTIVE').length,
        activitiesCount: officers
          .filter((o) => o.countryCode === 'KE' && o.county.toLowerCase() === cLower)
          .reduce((acc, o) => acc + o.activitiesJson.length, 0),
        verifiedCasesCount: beneficiaries.filter(
          (b) => b.county.toLowerCase() === cLower && b.verificationLevel === 'V4'
        ).length,
        totalCasesCount: cases.filter((vc) => vc.fieldCounty.toLowerCase() === cLower).length,
        outreachVolunteersCount: volunteers.filter((v) => v.county.toLowerCase() === cLower).length,
        communityProjectsCount: projects.filter((p) => p.county.toLowerCase() === cLower).length,
      };
    });

    const internationalEntries = officers.filter((o) => o.countryCode !== 'KE' || o.adminLevel === 'INTERNATIONAL');

    res.json({
      kenyan47Counties: KENYAN_47_COUNTIES,
      officers: visibleOfficers,
      internationalEntries,
      countyDashboards,
      jurisdictionRestrictedTo: !isNationalScope && allowedCounties ? Array.from(allowedCounties) : null,
    });
  } catch (err) {
    console.error('Field personnel load error:', err);
    res.status(500).json({ error: 'Unable to load county & community field personnel.' });
  }
});

staffRouter.post('/field-personnel', requirePrivilegedMfa, async (req: AuthRequest, res) => {
  try {
    if (isAuditorOnly(req)) {
      return res.status(403).json({ error: 'Auditors hold read-only audit access.' });
    }
    const allowed = hasHrAuthority(req) || req.authUser!.permissions.includes('canManageCountyOps') || req.authUser!.roles.includes('COUNTY_REPRESENTATIVE');
    if (!allowed) {
      return res.status(403).json({ error: 'National or HR administrator privileges required to appoint field personnel.' });
    }

    const schema = z.object({
      fullName: z.string().min(3),
      userId: z.string().uuid().optional().nullable(),
      fieldRole: z.enum([
        'COUNTY_COORDINATOR',
        'DEPUTY_COUNTY_COORDINATOR',
        'SUB_COUNTY_COORDINATOR',
        'WARD_FIELD_OFFICER',
        'COMMUNITY_OUTREACH_OFFICER',
        'COMMUNITY_AMBASSADOR',
        'VOLUNTEER_COORDINATOR',
        'FIELD_ASSESSMENT_OFFICER',
      ]),
      adminLevel: z.enum(['NATIONAL', 'COUNTY', 'SUB_COUNTY', 'WARD', 'COMMUNITY', 'INTERNATIONAL']),
      countryCode: z.string().default('KE'),
      county: z.string().min(2),
      subCounty: z.string().optional(),
      ward: z.string().optional(),
      communityUnit: z.string().optional(),
      supervisorName: z.string().min(3),
      assignedDuties: z.array(z.string()).min(1),
      additionalAuthorizedAreas: z.array(z.string()).default([]),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Complete field officer jurisdiction and duties required.' });
    const d = parsed.data;

    if (d.userId && d.userId === req.authUser!.userId) {
      return res.status(403).json({ error: 'Self-appointment prohibited: another authorised administrator must appoint you.' });
    }

    const officialId = `HC-FLD-${d.countryCode}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    const [created] = await db
      .insert(fieldGeographyOfficers)
      .values({
        officialIdNumber: officialId,
        userId: d.userId || null,
        fullName: d.fullName.trim(),
        fieldRole: d.fieldRole,
        adminLevel: d.adminLevel,
        countryCode: d.countryCode.toUpperCase(),
        county: d.county.trim(),
        subCounty: d.subCounty?.trim() || null,
        ward: d.ward?.trim() || null,
        communityUnit: d.communityUnit?.trim() || null,
        supervisorName: d.supervisorName.trim(),
        assignedDuties: d.assignedDuties,
        additionalAuthorizedAreas: d.additionalAuthorizedAreas,
        appointedByUserId: req.authUser!.userId,
        status: 'ACTIVE',
      })
      .returning();

    await writeAuditLog({
      actorUserId: req.authUser!.userId,
      actorRole: req.authUser!.activeRole,
      action: 'FIELD_OFFICER_APPOINTED',
      entityType: 'field_geography_officers',
      entityId: created.id,
      ip: req.ip,
      details: { officialId, fieldRole: d.fieldRole, county: d.county, adminLevel: d.adminLevel },
    });

    res.status(201).json({ officer: created });
  } catch (err) {
    console.error('Appoint field personnel error:', err);
    res.status(500).json({ error: 'Unable to appoint field geography officer.' });
  }
});

staffRouter.patch('/field-personnel/:id/activity', requirePrivilegedMfa, async (req: AuthRequest, res) => {
  try {
    if (isAuditorOnly(req)) {
      return res.status(403).json({ error: 'Auditors cannot modify field officer logs.' });
    }
    const id = String(req.params.id);
    const [target] = await db
      .select()
      .from(fieldGeographyOfficers)
      .where(eq(fieldGeographyOfficers.id, id))
      .limit(1);
    if (!target) return res.status(404).json({ error: 'Field officer record not found.' });

    const isNational =
      req.authUser!.roles.includes('SUPER_ADMIN') || req.authUser!.roles.includes('HR_OFFICER');
    if (!isNational) {
      const [actorOfficer] = await db
        .select()
        .from(fieldGeographyOfficers)
        .where(eq(fieldGeographyOfficers.userId, req.authUser!.userId))
        .limit(1);
      if (actorOfficer) {
        const permitted = [actorOfficer.county, ...actorOfficer.additionalAuthorizedAreas].map((c) => c.toLowerCase());
        if (!permitted.includes(target.county.toLowerCase())) {
          return res.status(403).json({
            error: `Jurisdiction restriction enforced: you are authorised for ${actorOfficer.county} only, not ${target.county}.`,
          });
        }
      }
    }

    const { activityTitle, activityLocation, activityOutcome, reportSummary, verifiedCasesCount, followUpDelta, performanceAssessment } =
      req.body as Record<string, any>;

    const nextActivities = activityTitle
      ? [
          ...target.activitiesJson,
          {
            date: new Date().toISOString().slice(0, 10),
            title: String(activityTitle),
            location: String(activityLocation || target.county),
            outcome: String(activityOutcome || 'Logged'),
          },
        ]
      : target.activitiesJson;

    const nextReports = reportSummary
      ? [
          ...target.fieldReportsJson,
          {
            date: new Date().toISOString().slice(0, 10),
            ref: `FR-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
            summary: String(reportSummary),
            verifiedCases: Number(verifiedCasesCount || 0),
          },
        ]
      : target.fieldReportsJson;

    const [updated] = await db
      .update(fieldGeographyOfficers)
      .set({
        activitiesJson: nextActivities,
        fieldReportsJson: nextReports,
        beneficiaryFollowUpCount: target.beneficiaryFollowUpCount + Math.max(0, Number(followUpDelta || 0)),
        ...(performanceAssessment ? { performanceAssessment: String(performanceAssessment) } : {}),
        updatedAt: new Date(),
      })
      .where(eq(fieldGeographyOfficers.id, id))
      .returning();

    res.json({ officer: updated });
  } catch (err) {
    console.error('Field activity error:', err);
    res.status(500).json({ error: 'Unable to log field officer activity.' });
  }
});

// 7. INDIVIDUAL DEPARTMENTAL WORKSPACES (ALL 15 DEPARTMENTS, 14 SECTIONS)
staffRouter.get('/departments/:deptNumber/workspace', async (req: AuthRequest, res) => {
  try {
    if (!hasAdminStaffAccess(req)) {
      return res.status(403).json({ error: 'Authorised staff access required.' });
    }
    const deptNumber = Number(req.params.deptNumber);
    const deptMeta = ORGANISATIONAL_DEPARTMENTS.find((d) => d.number === deptNumber);
    if (!deptMeta) return res.status(404).json({ error: 'Department not found.' });

    const [ownProfile] = await db
      .select()
      .from(staffEmployeeProfiles)
      .where(eq(staffEmployeeProfiles.userId, req.authUser!.userId))
      .limit(1);

    if (!canAccessDepartmentWorkspace(req, deptNumber, ownProfile?.departmentNumber)) {
      return res.status(403).json({
        error: `Departmental isolation enforced: you are not authorised to view ${deptMeta.name} confidential workspace records.`,
      });
    }

    const [positions, empProfiles, wsItems, deptTasks, deptMessages, perfReviews] = await Promise.all([
      db.select().from(staffPositions).where(eq(staffPositions.departmentNumber, deptNumber)),
      db.select().from(staffEmployeeProfiles).where(eq(staffEmployeeProfiles.departmentNumber, deptNumber)),
      db
        .select()
        .from(departmentalWorkspaceItems)
        .where(eq(departmentalWorkspaceItems.departmentNumber, deptNumber))
        .orderBy(desc(departmentalWorkspaceItems.createdAt)),
      db
        .select()
        .from(internalStaffTasks)
        .where(eq(internalStaffTasks.departmentNumber, deptNumber))
        .orderBy(desc(internalStaffTasks.createdAt)),
      db
        .select()
        .from(internalStaffMessages)
        .where(eq(internalStaffMessages.departmentNumber, deptNumber))
        .orderBy(desc(internalStaffMessages.createdAt)),
      db
        .select()
        .from(staffPerformanceReviews)
        .where(eq(staffPerformanceReviews.departmentNumber, deptNumber))
        .orderBy(desc(staffPerformanceReviews.createdAt)),
    ]);

    const headPosition =
      positions.find((p) => p.hierarchyLevel === 'DEPARTMENT_HEAD' || p.hierarchyLevel === 'NATIONAL_DIRECTOR' || p.hierarchyLevel === 'CEO' || p.hierarchyLevel === 'BOARD_CHAIR') ||
      positions[0] ||
      null;

    // Live operational domain slice tailored to each flagship department
    let domainOperationalSummary: Record<string, unknown> = {};
    if (deptNumber === 2) {
      const [vcCount] = await db.select({ c: sql<number>`count(*)::int` }).from(verificationCases);
      domainOperationalSummary = { activeVerificationCases: vcCount?.c ?? 0, domainFocus: 'Beneficiary Assessments, Document Reviews, Field Verification & Case Recommendations' };
    } else if (deptNumber === 3) {
      domainOperationalSummary = { domainFocus: 'Beneficiary Follow-Ups, Family Support, Welfare Interventions & Referrals' };
    } else if (deptNumber === 4) {
      const [geoCount] = await db.select({ c: sql<number>`count(*)::int` }).from(fieldGeographyOfficers);
      domainOperationalSummary = { appointedCountyOfficers: geoCount?.c ?? 0, domainFocus: 'County Activities, Field Visits, Outreach, Volunteers & Project Monitoring' };
    } else if (deptNumber === 5) {
      domainOperationalSummary = { domainFocus: 'Confidential Reports, Protection Concerns, Referrals, Risk Assessments & Follow-Ups' };
    } else if (deptNumber === 6) {
      const funds = await db.select({ code: humanitarianFunds.code, name: humanitarianFunds.name, balance: humanitarianFunds.availableBalanceMinor }).from(humanitarianFunds);
      domainOperationalSummary = { activeFundsCount: funds.length, funds, domainFocus: 'Donations, Budgets, Expenditure, Reconciliation & Financial Reports' };
    } else if (deptNumber === 9) {
      const [empCount] = await db.select({ c: sql<number>`count(*)::int` }).from(empowermentMilestones);
      domainOperationalSummary = { activeEmpowermentEnrolments: empCount?.c ?? 0, domainFocus: 'Training, Mentorship, Employment & Economic Development Programmes' };
    } else {
      domainOperationalSummary = { domainFocus: `${deptMeta.name} Departmental Delivery & Accountability` };
    }

    res.json({
      department: deptMeta,
      dashboard: {
        approvedPositions: positions.length,
        filledPositions: positions.filter((p) => p.vacancyStatus === 'FILLED').length,
        vacantPositions: positions.filter((p) => p.vacancyStatus === 'VACANT' || p.vacancyStatus === 'RECRUITING').length,
        pendingTasksCount: deptTasks.filter((t) => ['PENDING', 'ACCEPTED', 'IN_PROGRESS', 'AWAITING_REVIEW', 'OVERDUE'].includes(t.status)).length,
        completedTasksCount: deptTasks.filter((t) => t.status === 'COMPLETED').length,
        nationalIssuesCount: wsItems.filter((i) => i.itemType === 'NATIONAL_ISSUE').length,
      },
      domainOperationalSummary,
      departmentHeadProfile: headPosition ? sanitizePublicPosition(headPosition) : null,
      staffDirectory: empProfiles,
      departmentPositions: positions.map(sanitizePublicPosition),
      assignedResponsibilities: positions.flatMap((p) =>
        p.mainResponsibilities.map((r) => ({ jobId: p.jobId, jobTitle: p.jobTitle, responsibility: r }))
      ),
      dailyActivities: wsItems.filter((i) => i.itemType === 'DAILY_ACTIVITY'),
      pendingAssignments: [
        ...deptTasks.filter((t) => t.status !== 'COMPLETED' && t.status !== 'CANCELLED'),
        ...wsItems.filter((i) => i.itemType === 'ASSIGNMENT' && i.status !== 'COMPLETED'),
      ],
      completedAssignments: [
        ...deptTasks.filter((t) => t.status === 'COMPLETED'),
        ...wsItems.filter((i) => i.itemType === 'ASSIGNMENT' && i.status === 'COMPLETED'),
      ],
      performanceReports: [
        ...perfReviews,
        ...wsItems.filter((i) => i.itemType === 'PERFORMANCE_REPORT'),
      ],
      departmentDocuments: wsItems.filter((i) => i.itemType === 'DOCUMENT'),
      internalCommunications: [
        ...deptMessages,
        ...wsItems.filter((i) => i.itemType === 'COMMUNICATION'),
      ],
      meetingsAndSchedules: [
        ...deptMessages.filter((m) => m.channelType === 'MEETING_SCHEDULE' || m.channelType === 'MEETING_MINUTES'),
        ...wsItems.filter((i) => i.itemType === 'MEETING'),
      ],
      departmentalTargets: wsItems.filter((i) => i.itemType === 'TARGET'),
      monthlyReports: wsItems.filter((i) => i.itemType === 'MONTHLY_REPORT'),
      issuesRequiringNationalAttention: wsItems.filter((i) => i.itemType === 'NATIONAL_ISSUE'),
    });
  } catch (err) {
    console.error('Department workspace error:', err);
    res.status(500).json({ error: 'Unable to load departmental workspace.' });
  }
});

staffRouter.post('/departments/:deptNumber/workspace/items', requirePrivilegedMfa, async (req: AuthRequest, res) => {
  try {
    if (isAuditorOnly(req)) {
      return res.status(403).json({ error: 'Auditors hold read-only review access.' });
    }
    const deptNumber = Number(req.params.deptNumber);
    const deptMeta = ORGANISATIONAL_DEPARTMENTS.find((d) => d.number === deptNumber);
    if (!deptMeta) return res.status(404).json({ error: 'Department not found.' });

    const [ownProfile] = await db
      .select()
      .from(staffEmployeeProfiles)
      .where(eq(staffEmployeeProfiles.userId, req.authUser!.userId))
      .limit(1);
    if (!canAccessDepartmentWorkspace(req, deptNumber, ownProfile?.departmentNumber)) {
      return res.status(403).json({ error: 'Access denied to this department workspace.' });
    }

    const schema = z.object({
      itemType: z.enum([
        'DAILY_ACTIVITY',
        'ASSIGNMENT',
        'PERFORMANCE_REPORT',
        'DOCUMENT',
        'COMMUNICATION',
        'MEETING',
        'TARGET',
        'MONTHLY_REPORT',
        'NATIONAL_ISSUE',
      ]),
      title: z.string().min(3),
      summary: z.string().min(5),
      assignedToName: z.string().default(req.authUser!.fullName),
      dueDate: z.string().optional(),
      metricValue: z.string().optional(),
      metricTarget: z.string().optional(),
      priority: z.enum(['NORMAL', 'HIGH', 'CRITICAL']).default('NORMAL'),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Valid departmental workspace item required.' });

    if (deptNumber !== 5 && parsed.data.itemType === 'COMMUNICATION') {
      const check = screenGeneralCommunicationForConfidentiality(`${parsed.data.title} ${parsed.data.summary}`);
      if (!check.allowed) {
        return res.status(400).json({ error: check.reason });
      }
    }

    const [created] = await db
      .insert(departmentalWorkspaceItems)
      .values({
        departmentNumber: deptNumber,
        department: deptMeta.name,
        itemType: parsed.data.itemType,
        title: parsed.data.title,
        summary: parsed.data.summary,
        assignedToName: parsed.data.assignedToName,
        dueDate: parsed.data.dueDate || null,
        metricValue: parsed.data.metricValue || null,
        metricTarget: parsed.data.metricTarget || null,
        priority: parsed.data.priority,
        status: parsed.data.itemType === 'NATIONAL_ISSUE' ? 'ESCALATED' : 'PENDING',
        createdByUserId: req.authUser!.userId,
      })
      .returning();

    res.status(201).json({ item: created });
  } catch (err) {
    console.error('Create dept item error:', err);
    res.status(500).json({ error: 'Unable to save departmental item.' });
  }
});

// 8. STAFF PERFORMANCE & ACCOUNTABILITY CENTRE
staffRouter.get('/performance', async (req: AuthRequest, res) => {
  try {
    if (!hasAdminStaffAccess(req)) {
      return res.status(403).json({ error: 'Authorised staff access required.' });
    }
    const reviews = await db
      .select()
      .from(staffPerformanceReviews)
      .orderBy(desc(staffPerformanceReviews.updatedAt));
    res.json({
      reviews,
      safeguardNotice:
        'AI scores never automatically penalise or sanction staff. All evaluations combine 12 measurable indicators with documented supervisor, department head, HR review, and staff right-of-response.',
    });
  } catch (err) {
    console.error('Load performance reviews error:', err);
    res.status(500).json({ error: 'Unable to load performance reviews.' });
  }
});

staffRouter.post('/performance', requirePrivilegedMfa, async (req: AuthRequest, res) => {
  try {
    if (isAuditorOnly(req)) {
      return res.status(403).json({ error: 'Auditors hold read-only oversight access.' });
    }
    const schema = z.object({
      staffProfileId: z.string().uuid(),
      cadence: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL']),
      reviewPeriod: z.string().min(3),
      objectivesSummary: z.string().min(5),
      departmentalTargetRef: z.string().min(2),
      assignedTasksCount: z.number().int().min(0).default(0),
      completedActivitiesCount: z.number().int().min(0).default(0),
      timelinessScore: z.number().int().min(1).max(5).default(4),
      qualityOfWorkScore: z.number().int().min(1).max(5).default(4),
      beneficiaryServiceScore: z.number().int().min(1).max(5).default(4),
      professionalConductScore: z.number().int().min(1).max(5).default(5),
      teamworkScore: z.number().int().min(1).max(5).default(4),
      reportingAccuracyScore: z.number().int().min(1).max(5).default(4),
      trainingParticipationScore: z.number().int().min(1).max(5).default(4),
      safeguardingComplianceOk: z.boolean().default(true),
      selfAssessmentText: z.string().optional(),
      supervisorAssessmentText: z.string().optional(),
      overallRating: z.enum(['EXCEEDS', 'MEETS_EXPECTATIONS', 'NEEDS_IMPROVEMENT', 'PIP_ACTIVE']).default('MEETS_EXPECTATIONS'),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Complete performance review criteria required.' });
    const d = parsed.data;

    const [profile] = await db
      .select()
      .from(staffEmployeeProfiles)
      .where(eq(staffEmployeeProfiles.id, d.staffProfileId))
      .limit(1);
    if (!profile) return res.status(404).json({ error: 'Staff profile not found.' });

    const isSelf = profile.userId === req.authUser!.userId;
    if (!isSelf && !hasHrAuthority(req) && !req.authUser!.roles.includes('COUNTY_REPRESENTATIVE')) {
      return res.status(403).json({ error: 'Only supervisors, department heads, HR, or the staff member (self-assessment) may initiate this review.' });
    }

    const reviewRef = `PERF-${d.cadence.slice(0, 3)}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    const [created] = await db
      .insert(staffPerformanceReviews)
      .values({
        reviewRef,
        staffProfileId: profile.id,
        staffNumber: profile.staffNumber,
        staffName: profile.fullLegalName,
        departmentNumber: profile.departmentNumber,
        department: profile.department,
        cadence: d.cadence,
        reviewPeriod: d.reviewPeriod,
        objectivesSummary: d.objectivesSummary,
        departmentalTargetRef: d.departmentalTargetRef,
        assignedTasksCount: d.assignedTasksCount,
        completedActivitiesCount: d.completedActivitiesCount,
        metricsJson: {
          timelinessScore: d.timelinessScore,
          qualityOfWorkScore: d.qualityOfWorkScore,
          beneficiaryServiceScore: d.beneficiaryServiceScore,
          professionalConductScore: d.professionalConductScore,
          teamworkScore: d.teamworkScore,
          reportingAccuracyScore: d.reportingAccuracyScore,
          trainingParticipationScore: d.trainingParticipationScore,
          safeguardingComplianceOk: d.safeguardingComplianceOk,
        },
        selfAssessmentText: d.selfAssessmentText || null,
        supervisorAssessmentText: isSelf ? null : d.supervisorAssessmentText || null,
        overallRating: d.overallRating,
        reviewStage: isSelf ? 'SELF_ASSESSMENT' : 'SUPERVISOR_REVIEW',
        reviewerUserId: isSelf ? null : req.authUser!.userId,
      })
      .returning();

    res.status(201).json({ review: created });
  } catch (err) {
    console.error('Create performance review error:', err);
    res.status(500).json({ error: 'Unable to create performance assessment.' });
  }
});

staffRouter.patch('/performance/:id', requirePrivilegedMfa, async (req: AuthRequest, res) => {
  try {
    if (isAuditorOnly(req)) {
      return res.status(403).json({ error: 'Auditors hold read-only access.' });
    }
    const id = String(req.params.id);
    const [existing] = await db
      .select()
      .from(staffPerformanceReviews)
      .where(eq(staffPerformanceReviews.id, id))
      .limit(1);
    if (!existing) return res.status(404).json({ error: 'Performance review not found.' });

    const [profile] = await db
      .select()
      .from(staffEmployeeProfiles)
      .where(eq(staffEmployeeProfiles.id, existing.staffProfileId))
      .limit(1);

    const { actionType, supervisorAssessmentText, departmentHeadReviewText, hrReviewText, improvementPlan, recognitionCommendation, trainingRecommendation, overallRating, staffResponseText, challengeReason } =
      req.body as Record<string, any>;

    const patch: Record<string, any> = { updatedAt: new Date() };
    if (actionType === 'CHALLENGE') {
      patch.staffResponseText = staffResponseText || challengeReason || 'Record challenged by staff member';
      patch.challengeStatus = 'CHALLENGED';
      patch.challengeReason = challengeReason || 'Requesting formal supervisor/HR review';
    } else if (actionType === 'SUPERVISOR_ASSESS') {
      if (profile?.userId === req.authUser!.userId) {
        return res.status(403).json({ error: 'A staff member cannot sign off their own supervisor performance assessment.' });
      }
      patch.supervisorAssessmentText = supervisorAssessmentText;
      patch.improvementPlan = improvementPlan ?? existing.improvementPlan;
      patch.recognitionCommendation = recognitionCommendation ?? existing.recognitionCommendation;
      patch.trainingRecommendation = trainingRecommendation ?? existing.trainingRecommendation;
      if (overallRating) patch.overallRating = overallRating;
      patch.reviewStage = 'SUPERVISOR_REVIEW';
      patch.reviewerUserId = req.authUser!.userId;
    } else if (actionType === 'DEPT_HEAD_REVIEW') {
      if (profile?.userId === req.authUser!.userId) {
        return res.status(403).json({ error: 'A staff member cannot perform department head sign-off on their own review.' });
      }
      patch.departmentHeadReviewText = departmentHeadReviewText;
      patch.reviewStage = 'DEPT_HEAD_REVIEW';
      patch.deptHeadUserId = req.authUser!.userId;
    } else if (actionType === 'HR_REVIEW') {
      if (!hasHrAuthority(req) || profile?.userId === req.authUser!.userId) {
        return res.status(403).json({ error: 'Independent HR authorisation required for HR performance finalisation.' });
      }
      patch.hrReviewText = hrReviewText;
      patch.reviewStage = 'FINALISED';
      patch.hrReviewerUserId = req.authUser!.userId;
      if (existing.challengeStatus === 'CHALLENGED') patch.challengeStatus = 'RESOLVED';
    }

    const [updated] = await db
      .update(staffPerformanceReviews)
      .set(patch)
      .where(eq(staffPerformanceReviews.id, id))
      .returning();

    res.json({ review: updated });
  } catch (err) {
    console.error('Update performance review error:', err);
    res.status(500).json({ error: 'Unable to update performance review.' });
  }
});

// 9. INTERNAL STAFF COMMUNICATION & TASK MANAGEMENT CENTRE
staffRouter.get('/tasks', async (req: AuthRequest, res) => {
  if (!hasAdminStaffAccess(req)) {
    return res.status(403).json({ error: 'Authorised staff access required.' });
  }
  const tasks = await db.select().from(internalStaffTasks).orderBy(desc(internalStaffTasks.createdAt));
  res.json({ tasks });
});

staffRouter.post('/tasks', requirePrivilegedMfa, async (req: AuthRequest, res) => {
  try {
    if (isAuditorOnly(req)) {
      return res.status(403).json({ error: 'Auditors hold read-only oversight access.' });
    }
    const schema = z.object({
      targetScope: z.enum(['INDIVIDUAL', 'TEAM', 'DEPARTMENT']).default('INDIVIDUAL'),
      responsibleOfficerName: z.string().min(2),
      departmentNumber: z.number().int().min(1).max(15),
      title: z.string().min(3),
      description: z.string().min(6),
      priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('HIGH'),
      deadline: z.string().min(4),
      supportingDocuments: z.array(z.string()).default([]),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Complete task reference details required.' });
    const d = parsed.data;
    const deptMeta = ORGANISATIONAL_DEPARTMENTS.find((x) => x.number === d.departmentNumber);
    if (!deptMeta) return res.status(400).json({ error: 'Invalid department.' });

    const screen = screenGeneralCommunicationForConfidentiality(`${d.title} ${d.description}`);
    if (!screen.allowed) {
      return res.status(400).json({ error: screen.reason });
    }

    const taskReference = `TSK-${deptMeta.code}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    const [created] = await db
      .insert(internalStaffTasks)
      .values({
        taskReference,
        targetScope: d.targetScope,
        responsibleOfficerName: d.responsibleOfficerName,
        departmentNumber: d.departmentNumber,
        department: deptMeta.name,
        title: d.title,
        description: d.description,
        priority: d.priority,
        deadline: d.deadline,
        supportingDocuments: d.supportingDocuments,
        status: 'PENDING',
        supervisorName: req.authUser!.fullName,
        supervisorUserId: req.authUser!.userId,
      })
      .returning();

    res.status(201).json({ task: created });
  } catch (err) {
    console.error('Create task error:', err);
    res.status(500).json({ error: 'Unable to assign internal task.' });
  }
});

staffRouter.patch('/tasks/:id/status', requirePrivilegedMfa, async (req: AuthRequest, res) => {
  try {
    if (isAuditorOnly(req)) {
      return res.status(403).json({ error: 'Auditors hold read-only oversight access.' });
    }
    const { status, completionEvidence, reviewComments } = req.body as {
      status?: string;
      completionEvidence?: string;
      reviewComments?: string;
    };
    const allowedStatuses = [
      'PENDING',
      'ACCEPTED',
      'IN_PROGRESS',
      'AWAITING_REVIEW',
      'COMPLETED',
      'REJECTED',
      'OVERDUE',
      'CANCELLED',
    ];
    if (!status || !allowedStatuses.includes(status)) {
      return res.status(400).json({ error: 'Valid task status required.' });
    }

    const [updated] = await db
      .update(internalStaffTasks)
      .set({
        status,
        ...(completionEvidence !== undefined ? { completionEvidence } : {}),
        ...(reviewComments !== undefined ? { reviewComments } : {}),
        updatedAt: new Date(),
      })
      .where(eq(internalStaffTasks.id, String(req.params.id)))
      .returning();
    if (!updated) return res.status(404).json({ error: 'Task not found.' });

    res.json({ task: updated });
  } catch (err) {
    console.error('Task update error:', err);
    res.status(500).json({ error: 'Unable to update task status.' });
  }
});

staffRouter.get('/messages', async (req: AuthRequest, res) => {
  if (!hasAdminStaffAccess(req)) {
    return res.status(403).json({ error: 'Authorised staff access required.' });
  }
  const rows = await db
    .select()
    .from(internalStaffMessages)
    .orderBy(desc(internalStaffMessages.createdAt))
    .limit(100);
  res.json({ messages: rows });
});

staffRouter.post('/messages', requirePrivilegedMfa, async (req: AuthRequest, res) => {
  try {
    if (isAuditorOnly(req)) {
      return res.status(403).json({ error: 'Auditors cannot publish general internal announcements.' });
    }
    const schema = z.object({
      channelType: z.enum([
        'ANNOUNCEMENT',
        'DEPARTMENT_MESSAGE',
        'MEETING_SCHEDULE',
        'MEETING_MINUTES',
        'OPERATIONAL_INSTRUCTION',
        'ESCALATION_REQUEST',
        'DOCUMENT_SHARE',
      ]),
      departmentNumber: z.number().int().min(1).max(15).optional().nullable(),
      title: z.string().min(3),
      body: z.string().min(6),
      meetingDateTime: z.string().optional(),
      meetingLocationOrLink: z.string().optional(),
      attachmentDocTitle: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Valid internal message payload required.' });
    const d = parsed.data;

    // Rule: Keep confidential safeguarding and beneficiary PII out of general staff communication channels
    const screen = screenGeneralCommunicationForConfidentiality(`${d.title} ${d.body}`);
    if (!screen.allowed) {
      return res.status(400).json({ error: screen.reason });
    }

    const deptMeta = d.departmentNumber
      ? ORGANISATIONAL_DEPARTMENTS.find((x) => x.number === d.departmentNumber)
      : null;

    const messageRef = `MSG-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const [created] = await db
      .insert(internalStaffMessages)
      .values({
        messageRef,
        channelType: d.channelType,
        departmentNumber: d.departmentNumber || null,
        department: deptMeta?.name || 'All Departments',
        title: d.title,
        body: d.body,
        meetingDateTime: d.meetingDateTime || null,
        meetingLocationOrLink: d.meetingLocationOrLink || null,
        attachmentDocTitle: d.attachmentDocTitle || null,
        senderName: req.authUser!.fullName,
        senderUserId: req.authUser!.userId,
        confidentialityScreened: true,
      })
      .returning();

    res.status(201).json({ message: created });
  } catch (err) {
    console.error('Internal message error:', err);
    res.status(500).json({ error: 'Unable to publish internal staff communication.' });
  }
});

// 10. HUMAN RESOURCES & ORGANISATIONAL REPORTING CENTRE (17 LIVE REPORTS — ZERO FAKE STATS)
staffRouter.get('/reports/hr-summary', async (req: AuthRequest, res) => {
  try {
    if (!hasAdminStaffAccess(req)) {
      return res.status(403).json({ error: 'Authorised staff privileges required.' });
    }

    const deptFilter = req.query.departmentNumber ? Number(req.query.departmentNumber) : null;
    const jobTitleQ = typeof req.query.jobTitle === 'string' ? req.query.jobTitle.trim().toLowerCase() : '';
    const countyFilter = typeof req.query.county === 'string' ? req.query.county.trim().toLowerCase() : '';
    const regionFilter = typeof req.query.region === 'string' ? req.query.region.trim().toLowerCase() : '';
    const statusFilter = typeof req.query.employmentStatus === 'string' ? req.query.employmentStatus.trim() : 'ALL';
    const fromDate = typeof req.query.fromDate === 'string' && req.query.fromDate ? new Date(req.query.fromDate) : null;
    const toDate = typeof req.query.toDate === 'string' && req.query.toDate ? new Date(`${req.query.toDate}T23:59:59Z`) : null;

    const [positions, profiles, vacancies, apps, reviews, tasks, fieldOfficers, volunteers, onboardingRows] = await Promise.all([
      db.select().from(staffPositions),
      db.select().from(staffEmployeeProfiles),
      db.select().from(staffVacancies),
      db.select().from(recruitmentApplications),
      db.select().from(staffPerformanceReviews),
      db.select().from(internalStaffTasks),
      db.select().from(fieldGeographyOfficers),
      db.select().from(volunteerAssignments),
      db.select().from(staffOnboardingChecklists),
    ]);

    const filteredPositions = positions.filter((p) => {
      if (deptFilter && p.departmentNumber !== deptFilter) return false;
      if (jobTitleQ && !p.jobTitle.toLowerCase().includes(jobTitleQ)) return false;
      if (countyFilter && countyFilter !== 'all' && !p.geographicalJurisdiction.toLowerCase().includes(countyFilter)) return false;
      if (regionFilter && regionFilter !== 'all' && !p.geographicalJurisdiction.toLowerCase().includes(regionFilter)) return false;
      return true;
    });

    const filteredProfiles = profiles.filter((p) => {
      if (deptFilter && p.departmentNumber !== deptFilter) return false;
      if (jobTitleQ && !p.jobTitle.toLowerCase().includes(jobTitleQ)) return false;
      if (countyFilter && countyFilter !== 'all' && p.countyAssignment.toLowerCase() !== countyFilter) return false;
      if (regionFilter && regionFilter !== 'all' && !(p.internationalRegion || p.countryCode).toLowerCase().includes(regionFilter)) return false;
      if (statusFilter !== 'ALL' && p.employmentStatus !== statusFilter) return false;
      if (fromDate && new Date(p.createdAt) < fromDate) return false;
      if (toDate && new Date(p.createdAt) > toDate) return false;
      return true;
    });

    const totalApprovedPositions = filteredPositions.length;
    const filledPositions = filteredPositions.filter((p) => p.vacancyStatus === 'FILLED').length;
    const actingPositions = filteredPositions.filter((p) => p.vacancyStatus === 'ACTING').length;
    const vacantPositions = totalApprovedPositions - filledPositions;

    // 4 & 15. Staff by Department & Departmental Staffing Needs
    const staffByDepartment = ORGANISATIONAL_DEPARTMENTS.filter((d) => !deptFilter || d.number === deptFilter).map((d) => {
      const deptPos = filteredPositions.filter((p) => p.departmentNumber === d.number);
      const deptProf = filteredProfiles.filter((p) => p.departmentNumber === d.number && p.employmentStatus === 'ACTIVE');
      const filled = deptPos.filter((p) => p.vacancyStatus === 'FILLED').length;
      const vacant = deptPos.length - filled;
      return {
        departmentNumber: d.number,
        department: d.name,
        approved: deptPos.length,
        filled,
        vacant,
        activeEmployeeRecords: deptProf.length,
        fillPct: deptPos.length > 0 ? Math.round((filled / deptPos.length) * 100) : 0,
      };
    });

    const departmentalStaffingNeeds = staffByDepartment
      .map((d) => ({
        ...d,
        shortfallPositions: d.vacant,
        urgency: d.fillPct < 25 ? 'CRITICAL_SHORTFALL' : d.fillPct < 60 ? 'UNDERSTAFFED' : 'ADEQUATE',
      }))
      .sort((a, b) => b.shortfallPositions - a.shortfallPositions);

    // 5. Staff by County (only live active staff + field officers, no fake counts)
    const countyCountsMap = new Map<string, number>();
    for (const p of filteredProfiles.filter((x) => x.employmentStatus === 'ACTIVE')) {
      countyCountsMap.set(p.countyAssignment, (countyCountsMap.get(p.countyAssignment) || 0) + 1);
    }
    const staffByCounty = Array.from(countyCountsMap.entries()).map(([county, count]) => ({ county, count }));

    // 6. Staff by Employment Category
    const catMap = new Map<string, number>();
    for (const p of filteredProfiles) {
      catMap.set(p.employmentCategory, (catMap.get(p.employmentCategory) || 0) + 1);
    }
    const staffByEmploymentCategory = Array.from(catMap.entries()).map(([category, count]) => ({ category, count }));

    // 7. Staff by Gender (strictly aggregate lawful markers only)
    const genderMap = new Map<string, number>();
    for (const p of filteredProfiles) {
      const label = p.genderMarker || 'NOT_RECORDED';
      genderMap.set(label, (genderMap.get(label) || 0) + 1);
    }
    const staffByGender = Array.from(genderMap.entries()).map(([gender, count]) => ({ gender, count }));

    // 8. Recruitment Statistics
    const appsFiltered = apps.filter((a) => {
      if (fromDate && new Date(a.createdAt) < fromDate) return false;
      if (toDate && new Date(a.createdAt) > toDate) return false;
      return true;
    });
    const appStageMap = new Map<string, number>();
    for (const a of appsFiltered) {
      appStageMap.set(a.stage, (appStageMap.get(a.stage) || 0) + 1);
    }
    const recruitmentStatistics = {
      totalVacancies: vacancies.length,
      publishedVacancies: vacancies.filter((v) => v.stage === 'PUBLISHED').length,
      totalApplications: appsFiltered.length,
      byStage: Array.from(appStageMap.entries()).map(([stage, count]) => ({ stage, count })),
    };

    // 9–12: Training, Promotions, Transfers, Leave (live aggregates)
    const staffTraining = {
      completedTrainingSessions: filteredProfiles.reduce((acc, p) => acc + p.trainingHistory.length, 0),
      staffWithTrainingCount: filteredProfiles.filter((p) => p.trainingHistory.length > 0).length,
    };
    const staffPromotions = {
      totalPromotionsRecorded: filteredProfiles.reduce((acc, p) => acc + p.promotionHistory.length, 0),
    };
    const transfers = {
      transferredStaffCount: filteredProfiles.filter((p) => p.employmentStatus === 'TRANSFERRED').length,
    };
    const leaveRecords = {
      currentlyOnLeave: filteredProfiles.filter((p) => p.employmentStatus === 'ON_LEAVE').length,
      totalLeaveEventsRecorded: filteredProfiles.reduce((acc, p) => acc + p.leaveRecords.length, 0),
    };

    // 13. Staff Performance
    const ratingMap = new Map<string, number>();
    for (const rv of reviews) {
      if (deptFilter && rv.departmentNumber !== deptFilter) continue;
      ratingMap.set(rv.overallRating, (ratingMap.get(rv.overallRating) || 0) + 1);
    }
    const staffPerformance = {
      totalReviews: reviews.filter((r) => !deptFilter || r.departmentNumber === deptFilter).length,
      challengedReviews: reviews.filter((r) => r.challengeStatus === 'CHALLENGED').length,
      byRating: Array.from(ratingMap.entries()).map(([rating, count]) => ({ rating, count })),
    };

    // 14. Volunteer Numbers
    const volunteerNumbers = {
      establishmentVolunteerRoles: filteredPositions.filter((p) => p.hierarchyLevel === 'VOLUNTEER').length,
      activeCommunityVolunteers: volunteers.length,
      volunteerCoordinatorsAppointed: fieldOfficers.filter((f) => f.fieldRole === 'VOLUNTEER_COORDINATOR').length,
    };

    // 16. Staff Exits
    const staffExits = {
      resigned: filteredProfiles.filter((p) => p.employmentStatus === 'RESIGNED').length,
      retired: filteredProfiles.filter((p) => p.employmentStatus === 'RETIRED').length,
      terminated: filteredProfiles.filter((p) => p.employmentStatus === 'TERMINATED').length,
    };

    // 17. Organisational Capacity
    const completedTasksCount = tasks.filter((t) => t.status === 'COMPLETED').length;
    const countiesWithFieldStaff = new Set(
      fieldOfficers.filter((f) => f.countryCode === 'KE').map((f) => f.county.toLowerCase())
    ).size;

    const organisationalCapacity = {
      establishmentFillRatePct: totalApprovedPositions > 0 ? Math.round((filledPositions / totalApprovedPositions) * 100) : 0,
      kenyaCountyCoverageCount: countiesWithFieldStaff,
      kenyaCountyCoveragePct: Math.round((countiesWithFieldStaff / KENYAN_47_COUNTIES.length) * 100),
      taskCompletionRatePct: tasks.length > 0 ? Math.round((completedTasksCount / tasks.length) * 100) : 0,
      internationalOfficersCount: fieldOfficers.filter((f) => f.countryCode !== 'KE').length,
    };

    res.json({
      generatedAt: new Date().toISOString(),
      publicSafeReport: true,
      confidentialPiiExcluded: true,
      reports: {
        totalApprovedPositions,
        filledPositions,
        actingPositions,
        vacantPositions,
        staffByDepartment,
        staffByCounty,
        staffByEmploymentCategory,
        staffByGender,
        recruitmentStatistics,
        staffTraining,
        staffPromotions,
        transfers,
        leaveRecords,
        staffPerformance,
        volunteerNumbers,
        departmentalStaffingNeeds,
        staffExits,
        organisationalCapacity,
        onboardingSummary: {
          totalTrackers: onboardingRows.length,
          readyForActivation: onboardingRows.filter((o) => o.overallStatus === 'READY_FOR_ACTIVATION').length,
          inProgress: onboardingRows.filter((o) => o.overallStatus === 'IN_PROGRESS' || o.overallStatus === 'NOT_STARTED').length,
          completed: onboardingRows.filter((o) => o.overallStatus === 'COMPLETED').length,
          avgCompletionPct:
            onboardingRows.length > 0
              ? Math.round(
                  onboardingRows.reduce((acc, o) => acc + o.completionPct, 0) / onboardingRows.length
                )
              : 0,
        },
      },
    });
  } catch (err) {
    console.error('HR summary reports error:', err);
    res.status(500).json({ error: 'Unable to compile HR & Organisational reports.' });
  }
});

// =========================================================================
// 11. AUTOMATED STAFF ONBOARDING PROGRESS TRACKER (DOCUMENTS, TRAINING, CREDENTIALS)
// =========================================================================

staffRouter.get('/onboarding', async (req: AuthRequest, res) => {
  try {
    const canSeeAll = hasRecruitmentReadAuthority(req) || hasAdminStaffAccess(req);
    const auditorMask = isAuditorOnly(req);
    const rows = await db
      .select()
      .from(staffOnboardingChecklists)
      .orderBy(desc(staffOnboardingChecklists.updatedAt));

    const visibleRows = canSeeAll
      ? rows
      : rows.filter((r) => r.userId && r.userId === req.authUser!.userId);

    const formatted = visibleRows.map((row) => {
      const fullName = decryptSensitiveText(row.newHireNameEnc);
      const email = decryptSensitiveText(row.newHireEmailEnc);
      const computed = computeOnboardingProgress(
        row.milestonesJson,
        row.overallStatus === 'COMPLETED' || Boolean(row.activatedAt)
      );

      return {
        id: row.id,
        onboardingRef: row.onboardingRef,
        applicationId: row.applicationId,
        staffProfileId: row.staffProfileId,
        userId: row.userId,
        jobId: row.jobId,
        departmentNumber: row.departmentNumber,
        department: row.department,
        jobTitle: row.jobTitle,
        newHireName: auditorMask ? `${fullName.slice(0, 2)}*** (Audit Masked)` : fullName,
        newHireEmail: auditorMask ? `***@${email.split('@')[1] || 'hidden'}` : email,
        overallStatus: row.overallStatus,
        completionPct: computed.completionPct,
        tracks: computed.tracks,
        completedRequiredCount: computed.completedRequiredCount,
        requiredMilestones: computed.requiredMilestones,
        submittedCount: computed.submittedCount,
        rejectedCount: computed.rejectedCount,
        dueDate: row.dueDate,
        milestones: row.milestonesJson,
        activatedAt: row.activatedAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    });

    const summary = {
      total: formatted.length,
      notStarted: formatted.filter((f) => f.overallStatus === 'NOT_STARTED').length,
      inProgress: formatted.filter((f) => f.overallStatus === 'IN_PROGRESS').length,
      blocked: formatted.filter((f) => f.overallStatus === 'BLOCKED').length,
      readyForActivation: formatted.filter((f) => f.overallStatus === 'READY_FOR_ACTIVATION').length,
      completed: formatted.filter((f) => f.overallStatus === 'COMPLETED').length,
      avgCompletionPct:
        formatted.length > 0
          ? Math.round(formatted.reduce((acc, f) => acc + f.completionPct, 0) / formatted.length)
          : 0,
    };

    res.json({ checklists: formatted, summary });
  } catch (err) {
    console.error('Load onboarding progress error:', err);
    res.status(500).json({ error: 'Unable to load automated onboarding tracker.' });
  }
});

staffRouter.post('/onboarding', requirePrivilegedMfa, async (req: AuthRequest, res) => {
  try {
    if (isAuditorOnly(req) || !hasHrAuthority(req)) {
      return res.status(403).json({ error: 'Authorised HR Officer or Super Admin privileges required to initiate onboarding.' });
    }

    const schema = z.object({
      staffProfileId: z.string().uuid().optional(),
      applicationId: z.string().uuid().optional(),
      dueDate: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success || (!parsed.data.staffProfileId && !parsed.data.applicationId)) {
      return res.status(400).json({ error: 'Provide either an existing staffProfileId or approved applicationId.' });
    }
    const d = parsed.data;

    let pos: typeof staffPositions.$inferSelect | undefined;
    let newHireName = '';
    let newHireEmail = '';
    let targetUserId: string | null = null;
    let appDocsVerified = false;
    let bgCleared = false;

    if (d.staffProfileId) {
      const [existingOnb] = await db
        .select()
        .from(staffOnboardingChecklists)
        .where(eq(staffOnboardingChecklists.staffProfileId, d.staffProfileId))
        .limit(1);
      if (existingOnb) {
        return res.status(400).json({ error: `Onboarding tracker ${existingOnb.onboardingRef} already exists for this staff profile.` });
      }
      const [prof] = await db
        .select()
        .from(staffEmployeeProfiles)
        .where(eq(staffEmployeeProfiles.id, d.staffProfileId))
        .limit(1);
      if (!prof) return res.status(404).json({ error: 'Staff profile not found.' });
      const [foundPos] = await db.select().from(staffPositions).where(eq(staffPositions.jobId, prof.jobId)).limit(1);
      pos = foundPos;
      newHireName = prof.fullLegalName;
      newHireEmail = prof.contactEmail;
      targetUserId = prof.userId;
    } else if (d.applicationId) {
      const [existingOnb] = await db
        .select()
        .from(staffOnboardingChecklists)
        .where(eq(staffOnboardingChecklists.applicationId, d.applicationId))
        .limit(1);
      if (existingOnb) {
        return res.status(400).json({ error: `Onboarding tracker ${existingOnb.onboardingRef} already exists for this application.` });
      }
      const [app] = await db
        .select()
        .from(recruitmentApplications)
        .where(eq(recruitmentApplications.id, d.applicationId))
        .limit(1);
      if (!app) return res.status(404).json({ error: 'Recruitment application not found.' });
      const [foundPos] = await db.select().from(staffPositions).where(eq(staffPositions.jobId, app.jobId)).limit(1);
      pos = foundPos;
      newHireName = decryptSensitiveText(app.applicantNameEnc);
      newHireEmail = decryptSensitiveText(app.applicantEmailEnc);
      targetUserId = app.applicantUserId;
      appDocsVerified = app.documentsJson.length > 0 && app.documentsJson.every((doc) => doc.verified);
      bgCleared = app.backgroundCheckStatus === 'CLEARED';
    }

    if (!pos) return res.status(404).json({ error: 'Approved organisational position not found.' });

    const milestones = buildDefaultOnboardingMilestones({
      jobId: pos.jobId,
      jobTitle: pos.jobTitle,
      department: pos.department,
      requiredQualifications: pos.requiredQualifications,
      professionalQualifications: pos.professionalQualifications,
      safeguardingResponsibilities: pos.safeguardingResponsibilities,
      applicationDocsVerified: appDocsVerified,
      backgroundCleared: bgCleared,
    });
    const progress = computeOnboardingProgress(milestones, false);
    const onboardingRef = `ONB-${new Date().getFullYear()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

    const [created] = await db
      .insert(staffOnboardingChecklists)
      .values({
        onboardingRef,
        applicationId: d.applicationId || null,
        staffProfileId: d.staffProfileId || null,
        userId: targetUserId,
        jobId: pos.jobId,
        departmentNumber: pos.departmentNumber,
        department: pos.department,
        jobTitle: pos.jobTitle,
        newHireNameEnc: encryptSensitiveText(newHireName),
        newHireEmailEnc: encryptSensitiveText(newHireEmail),
        overallStatus: progress.overallStatus,
        completionPct: progress.completionPct,
        dueDate: d.dueDate || new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
        milestonesJson: milestones,
        createdByUserId: req.authUser!.userId,
      })
      .returning();

    await writeAuditLog({
      actorUserId: req.authUser!.userId,
      actorRole: req.authUser!.activeRole,
      action: 'STAFF_ONBOARDING_INITIATED',
      entityType: 'staff_onboarding_checklists',
      entityId: created.id,
      ip: req.ip,
      details: { onboardingRef, jobId: pos.jobId },
    });

    res.status(201).json({ onboardingRef, checklist: created });
  } catch (err) {
    console.error('Initiate onboarding error:', err);
    res.status(500).json({ error: 'Unable to initiate onboarding progress tracker.' });
  }
});

staffRouter.patch('/onboarding/:id/milestones', async (req: AuthRequest, res) => {
  try {
    if (isAuditorOnly(req)) {
      return res.status(403).json({ error: 'Auditors hold read-only audit access.' });
    }

    const schema = z.object({
      milestoneCode: z.string().min(2),
      status: z.enum(['PENDING', 'SUBMITTED', 'VERIFIED', 'WAIVED', 'REJECTED']),
      evidenceRef: z.string().max(300).optional(),
      notes: z.string().max(500).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Valid onboarding milestone code and status required.' });
    }
    const d = parsed.data;
    const checklistId = String(req.params.id);

    const [tracker] = await db
      .select()
      .from(staffOnboardingChecklists)
      .where(eq(staffOnboardingChecklists.id, checklistId))
      .limit(1);
    if (!tracker) return res.status(404).json({ error: 'Onboarding checklist not found.' });

    const isOwner = Boolean(tracker.userId && tracker.userId === req.authUser!.userId);
    const isVerifier =
      hasHrAuthority(req) ||
      req.authUser!.roles.includes('COUNTY_REPRESENTATIVE') ||
      req.authUser!.permissions.includes('canVerifyUsers');

    if (d.status === 'SUBMITTED' || d.status === 'PENDING') {
      if (!isOwner && !isVerifier) {
        return res.status(403).json({ error: 'You are not authorised to update this onboarding checklist.' });
      }
    } else {
      // Verifying, waiving, or rejecting credentials requires HR/Supervisor + MFA step-up + anti-self-approval
      if (!isVerifier) {
        return res.status(403).json({
          error: 'Only authorised HR Officers or supervisors may verify, waive, or reject onboarding milestones.',
        });
      }
      if (req.authUser!.mfaEnabled && !req.authUser!.mfaVerifiedInSession) {
        return res.status(403).json({ error: 'TOTP MFA verification required for credential verification actions.' });
      }
      const guard = canVerifyOnboardingMilestone(req.authUser!.userId, tracker.userId);
      if (!guard.allowed) {
        return res.status(403).json({ error: guard.reason });
      }
    }

    const targetIdx = tracker.milestonesJson.findIndex((m) => m.code === d.milestoneCode);
    if (targetIdx === -1) {
      return res.status(404).json({ error: 'Onboarding milestone code not found on this checklist.' });
    }

    const nowIso = new Date().toISOString();
    const updatedMilestones = tracker.milestonesJson.map((m, idx) => {
      if (idx !== targetIdx) return m;
      return {
        ...m,
        status: d.status,
        ...(d.evidenceRef !== undefined ? { evidenceRef: d.evidenceRef.trim() } : {}),
        ...(d.notes !== undefined ? { notes: d.notes.trim() } : {}),
        ...(d.status === 'SUBMITTED' ? { submittedAt: nowIso } : {}),
        ...(d.status === 'VERIFIED' || d.status === 'WAIVED' || d.status === 'REJECTED'
          ? {
              verifiedAt: nowIso,
              verifiedByName: req.authUser!.fullName,
              verifiedByUserId: req.authUser!.userId,
            }
          : {}),
      };
    });

    const targetMilestone = updatedMilestones[targetIdx];
    const progress = computeOnboardingProgress(
      updatedMilestones,
      tracker.overallStatus === 'COMPLETED' && d.status !== 'REJECTED'
    );

    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(staffOnboardingChecklists)
        .set({
          milestonesJson: updatedMilestones,
          completionPct: progress.completionPct,
          overallStatus: progress.overallStatus,
          updatedAt: new Date(),
        })
        .where(eq(staffOnboardingChecklists.id, tracker.id))
        .returning();

      // Synchronise verified onboarding training automatically to Staff Employee Profile trainingHistory
      if (
        tracker.staffProfileId &&
        targetMilestone.category === 'TRAINING_COMPLETION' &&
        d.status === 'VERIFIED'
      ) {
        const [prof] = await tx
          .select()
          .from(staffEmployeeProfiles)
          .where(eq(staffEmployeeProfiles.id, tracker.staffProfileId))
          .limit(1);
        if (prof) {
          const alreadyLogged = prof.trainingHistory.some(
            (t) => t.course.toLowerCase() === targetMilestone.title.toLowerCase()
          );
          if (!alreadyLogged) {
            await tx
              .update(staffEmployeeProfiles)
              .set({
                trainingHistory: [
                  ...prof.trainingHistory,
                  {
                    date: nowIso.slice(0, 10),
                    course: targetMilestone.title,
                    provider: 'Humanity Connect Automated Onboarding Academy',
                    status: 'COMPLETED',
                  },
                ],
                updatedAt: new Date(),
              })
              .where(eq(staffEmployeeProfiles.id, prof.id));
          }
        }
      }

      return row;
    });

    await writeAuditLog({
      actorUserId: req.authUser!.userId,
      actorRole: req.authUser!.activeRole,
      action: 'ONBOARDING_MILESTONE_UPDATED',
      entityType: 'staff_onboarding_checklists',
      entityId: tracker.id,
      ip: req.ip,
      details: {
        onboardingRef: tracker.onboardingRef,
        milestoneCode: d.milestoneCode,
        newStatus: d.status,
        completionPct: progress.completionPct,
        overallStatus: progress.overallStatus,
      },
    });

    res.json({ checklist: updated, progress });
  } catch (err) {
    console.error('Update onboarding milestone error:', err);
    res.status(500).json({ error: 'Unable to update onboarding milestone.' });
  }
});

staffRouter.post('/onboarding/:id/complete', requirePrivilegedMfa, async (req: AuthRequest, res) => {
  try {
    if (isAuditorOnly(req) || !hasHrAuthority(req)) {
      return res.status(403).json({ error: 'HR Officer or Super Admin authorisation required to finalise onboarding.' });
    }
    const checklistId = String(req.params.id);
    const [tracker] = await db
      .select()
      .from(staffOnboardingChecklists)
      .where(eq(staffOnboardingChecklists.id, checklistId))
      .limit(1);
    if (!tracker) return res.status(404).json({ error: 'Onboarding checklist not found.' });

    if (tracker.userId && tracker.userId === req.authUser!.userId) {
      return res.status(403).json({
        error: 'Separation of duties enforced: you cannot approve final activation of your own onboarding.',
      });
    }

    const readiness = isOnboardingReadyForActivation(tracker.milestonesJson);
    if (!readiness.ready) {
      return res.status(400).json({
        error: `Cannot activate yet. Pending required milestones: ${readiness.missingTitles.join(', ')}`,
      });
    }

    const now = new Date();
    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(staffOnboardingChecklists)
        .set({
          overallStatus: 'COMPLETED',
          completionPct: 100,
          activatedAt: now,
          updatedAt: now,
        })
        .where(eq(staffOnboardingChecklists.id, tracker.id))
        .returning();

      if (tracker.staffProfileId) {
        await tx
          .update(staffEmployeeProfiles)
          .set({ employmentStatus: 'ACTIVE', updatedAt: now })
          .where(eq(staffEmployeeProfiles.id, tracker.staffProfileId));
      }
      if (tracker.applicationId) {
        await tx
          .update(recruitmentApplications)
          .set({ stage: 'ACTIVE_EMPLOYEE', updatedAt: now })
          .where(eq(recruitmentApplications.id, tracker.applicationId));
      }

      if (tracker.userId) {
        await tx.insert(notifications).values({
          userId: tracker.userId,
          category: 'SYSTEM',
          title: `Onboarding Complete — Active Staff Status (${tracker.jobId})`,
          body: `All required documents, training modules, and credential checks for ${tracker.jobTitle} (${tracker.onboardingRef}) are verified. Your profile is now active.`,
        });
      }
      return row;
    });

    await writeAuditLog({
      actorUserId: req.authUser!.userId,
      actorRole: req.authUser!.activeRole,
      action: 'STAFF_ONBOARDING_COMPLETED',
      entityType: 'staff_onboarding_checklists',
      entityId: tracker.id,
      ip: req.ip,
      details: { onboardingRef: tracker.onboardingRef, jobId: tracker.jobId },
    });

    res.json({ checklist: updated });
  } catch (err) {
    console.error('Complete onboarding error:', err);
    res.status(500).json({ error: 'Unable to finalise onboarding.' });
  }
});
