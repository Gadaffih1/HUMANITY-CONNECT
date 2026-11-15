import { sql } from 'drizzle-orm';
import { db, pool, withDbRetry } from './index.ts';
import { staffDepartments, staffPositions } from './schema.ts';
import { ORGANISATIONAL_DEPARTMENTS, STAFF_ESTABLISHMENT_170 } from '../data/staffEstablishment.ts';

const DEPARTMENT_FOCUS_MAP: Record<number, string> = {
  1: 'National Strategic Governance, Executive Accountability & Multi-County Administration',
  2: 'Beneficiary Assessments, Document Reviews, Field Verification & Case Recommendations',
  3: 'Beneficiary Follow-Ups, Family Support, Welfare Interventions & Referrals',
  4: '47-County Field Activities, Sub-County & Ward Outreach, Volunteers & Project Monitoring',
  5: 'Confidential Reports, Child & Minor Protection, Referrals, Risk Assessments & Safeguarding',
  6: 'Donations, M-Pesa Ledger, Budgets, Expenditure Reconciliation & Statutory Financial Audits',
  7: 'Corporate Partnerships, Institutional Grants, Foundations & CSR Alignment',
  8: 'Community Projects, Water & Infrastructure Builds & Emergency Disaster Response',
  9: 'Empowerment Training, Scholarships, Mentorship & Micro-Grant Economic Development',
  10: 'Volunteer Mobilisation, Screening, Safeguarding Clearance & County Deployments',
  11: 'Consent-Verified Storytelling, Public Transparency, Media & Stakeholder Awareness',
  12: 'Monitoring, Evaluation, Research, Longitudinal Impact & Accountability',
  13: 'Beneficiary & Sponsor Support Desk, Grievance Redress & Helpline Operations',
  14: 'International Operations, Cross-Border Partnerships & Diaspora Coordination',
  15: 'Independent Board Oversight, Internal Audit & Separation-of-Duties Governance',
};

let establishmentReadyPromise: Promise<void> | null = null;

export function ensureStaffEstablishmentDirectoryReady(): Promise<void> {
  if (!establishmentReadyPromise) {
    establishmentReadyPromise = bootstrapStaffEstablishmentDirectory().catch((err) => {
      establishmentReadyPromise = null;
      throw err;
    });
  }
  return establishmentReadyPromise;
}

async function bootstrapStaffEstablishmentDirectory(): Promise<void> {
  const preCheck = await withDbRetry(
    () =>
      pool.query<{
        has_depts: boolean;
        has_positions: boolean;
        has_vacancies: boolean;
        has_revisions: boolean;
        has_apps: boolean;
        has_profiles: boolean;
        has_disc: boolean;
        has_field: boolean;
        has_dept_ws: boolean;
        has_perf: boolean;
        has_tasks: boolean;
        has_msgs: boolean;
        has_onboarding: boolean;
        dept_count: number;
        pos_count: number;
      }>(`
        SELECT
          (to_regclass('public.staff_departments') IS NOT NULL) AS has_depts,
          (to_regclass('public.staff_positions') IS NOT NULL) AS has_positions,
          (to_regclass('public.staff_vacancies') IS NOT NULL) AS has_vacancies,
          (to_regclass('public.staff_position_revisions') IS NOT NULL) AS has_revisions,
          (to_regclass('public.recruitment_applications') IS NOT NULL) AS has_apps,
          (to_regclass('public.staff_employee_profiles') IS NOT NULL) AS has_profiles,
          (to_regclass('public.staff_disciplinary_records') IS NOT NULL) AS has_disc,
          (to_regclass('public.field_geography_officers') IS NOT NULL) AS has_field,
          (to_regclass('public.departmental_workspace_items') IS NOT NULL) AS has_dept_ws,
          (to_regclass('public.staff_performance_reviews') IS NOT NULL) AS has_perf,
          (to_regclass('public.internal_staff_tasks') IS NOT NULL) AS has_tasks,
          (to_regclass('public.internal_staff_messages') IS NOT NULL) AS has_msgs,
          (to_regclass('public.staff_onboarding_checklists') IS NOT NULL) AS has_onboarding,
          COALESCE((SELECT count(*)::int FROM public.staff_departments), 0) AS dept_count,
          COALESCE((SELECT count(*)::int FROM public.staff_positions), 0) AS pos_count
      `),
    2
  ).catch(() => null);

  const row = preCheck?.rows?.[0];
  const allTablesExist = Boolean(
    row?.has_depts &&
      row?.has_positions &&
      row?.has_vacancies &&
      row?.has_revisions &&
      row?.has_apps &&
      row?.has_profiles &&
      row?.has_disc &&
      row?.has_field &&
      row?.has_dept_ws &&
      row?.has_perf &&
      row?.has_tasks &&
      row?.has_msgs &&
      row?.has_onboarding
  );

  if (!allTablesExist) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(174501, 4)');
      await client.query(`
        CREATE TABLE IF NOT EXISTS "public"."staff_departments" (
          "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
          "department_number" integer NOT NULL UNIQUE,
          "code" text NOT NULL UNIQUE,
          "name" text NOT NULL,
          "planned_count" integer DEFAULT 0 NOT NULL,
          "head_job_id" text,
          "workspace_focus" text DEFAULT '' NOT NULL,
          "is_active" boolean DEFAULT true NOT NULL,
          "created_at" timestamptz DEFAULT now() NOT NULL,
          "updated_at" timestamptz DEFAULT now() NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_staff_departments_num ON public.staff_departments USING btree (department_number, code);

        CREATE TABLE IF NOT EXISTS "public"."staff_positions" (
          "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
          "job_id" text NOT NULL UNIQUE,
          "department_number" integer NOT NULL,
          "department" text NOT NULL,
          "job_title" text NOT NULL,
          "hierarchy_level" text DEFAULT 'FIELD_OFFICER' NOT NULL,
          "reports_to_job_id" text,
          "independent_oversight" boolean DEFAULT false NOT NULL,
          "job_description" text NOT NULL,
          "main_responsibilities" jsonb NOT NULL,
          "daily_responsibilities" jsonb NOT NULL,
          "weekly_responsibilities" jsonb NOT NULL,
          "monthly_responsibilities" jsonb NOT NULL,
          "required_qualifications" text NOT NULL,
          "professional_qualifications" text NOT NULL,
          "required_experience" text NOT NULL,
          "professional_skills" jsonb NOT NULL,
          "communication_skills" jsonb NOT NULL,
          "ethical_requirements" text NOT NULL,
          "safeguarding_responsibilities" text NOT NULL,
          "reporting_officer" text NOT NULL,
          "supervisory_responsibilities" text NOT NULL,
          "geographical_jurisdiction" text NOT NULL,
          "employment_status" text NOT NULL,
          "working_conditions" text NOT NULL,
          "professional_development" text NOT NULL,
          "performance_expectations" text NOT NULL,
          "incumbent_name" text,
          "incumbent_user_id" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL,
          "acting_officer_name" text,
          "acting_officer_user_id" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL,
          "vacancy_status" text DEFAULT 'VACANT' NOT NULL,
          "is_vacancy_published" boolean DEFAULT false NOT NULL,
          "vacancy_published_at" timestamptz,
          "revision_status" text DEFAULT 'APPROVED' NOT NULL,
          "revision_version" integer DEFAULT 1 NOT NULL,
          "last_revised_by" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL,
          "last_approved_by" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL,
          "created_at" timestamptz DEFAULT now() NOT NULL,
          "updated_at" timestamptz DEFAULT now() NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_staff_positions_dept ON public.staff_positions USING btree (department_number, job_title);
        CREATE INDEX IF NOT EXISTS idx_staff_positions_reports ON public.staff_positions USING btree (reports_to_job_id);

        CREATE TABLE IF NOT EXISTS "public"."staff_position_revisions" (
          "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
          "position_id" uuid NOT NULL REFERENCES "public"."staff_positions"("id") ON DELETE CASCADE,
          "job_id" text NOT NULL,
          "proposed_changes_json" jsonb NOT NULL,
          "revision_note" text NOT NULL,
          "status" text DEFAULT 'PENDING_APPROVAL' NOT NULL,
          "proposed_by" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE CASCADE,
          "reviewed_by" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL,
          "reviewed_at" timestamptz,
          "created_at" timestamptz DEFAULT now() NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_staff_revisions_pos ON public.staff_position_revisions USING btree (position_id, status);

        CREATE TABLE IF NOT EXISTS "public"."staff_vacancies" (
          "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
          "vacancy_code" text NOT NULL UNIQUE,
          "position_id" uuid NOT NULL REFERENCES "public"."staff_positions"("id") ON DELETE CASCADE,
          "job_id" text NOT NULL,
          "job_title" text NOT NULL,
          "department_number" integer NOT NULL,
          "department" text NOT NULL,
          "job_location" text NOT NULL,
          "employment_type" text DEFAULT 'FULL_TIME' NOT NULL,
          "job_description" text NOT NULL,
          "academic_qualifications" text NOT NULL,
          "professional_requirements" text NOT NULL,
          "experience_requirements" text NOT NULL,
          "application_deadline" timestamptz NOT NULL,
          "required_documents" jsonb NOT NULL,
          "application_instructions" text NOT NULL,
          "stage" text DEFAULT 'VACANCY_DRAFT' NOT NULL,
          "created_by" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL,
          "approved_by" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL,
          "published_at" timestamptz,
          "created_at" timestamptz DEFAULT now() NOT NULL,
          "updated_at" timestamptz DEFAULT now() NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_staff_vacancies_stage ON public.staff_vacancies USING btree (stage, department_number);

        CREATE TABLE IF NOT EXISTS "public"."recruitment_applications" (
          "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
          "application_ref" text NOT NULL UNIQUE,
          "vacancy_id" uuid NOT NULL REFERENCES "public"."staff_vacancies"("id") ON DELETE CASCADE,
          "job_id" text NOT NULL,
          "applicant_user_id" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL,
          "applicant_name_enc" text NOT NULL,
          "applicant_email_enc" text NOT NULL,
          "applicant_phone_enc" text NOT NULL,
          "national_id_enc" text,
          "county" text DEFAULT 'Nairobi' NOT NULL,
          "academic_summary" text NOT NULL,
          "professional_certs_summary" text NOT NULL,
          "experience_years" integer DEFAULT 0 NOT NULL,
          "cover_note" text NOT NULL,
          "documents_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
          "stage" text DEFAULT 'APPLICATIONS_RECEIVED' NOT NULL,
          "interview_scheduled_at" timestamptz,
          "interview_location_or_link" text,
          "interview_score" integer,
          "interview_assessment_notes" text,
          "reference_check_status" text DEFAULT 'PENDING' NOT NULL,
          "reference_check_notes" text,
          "background_check_status" text DEFAULT 'PENDING' NOT NULL,
          "background_check_notes" text,
          "offer_terms_summary" text,
          "offer_issued_at" timestamptz,
          "offer_accepted_at" timestamptz,
          "proposed_appointment_by" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL,
          "appointment_approved_by" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL,
          "appointment_approved_at" timestamptz,
          "stage_notes" text,
          "created_at" timestamptz DEFAULT now() NOT NULL,
          "updated_at" timestamptz DEFAULT now() NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_recruit_apps_vacancy_stage ON public.recruitment_applications USING btree (vacancy_id, stage);

        CREATE TABLE IF NOT EXISTS "public"."staff_employee_profiles" (
          "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
          "staff_number" text NOT NULL UNIQUE,
          "user_id" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL,
          "position_id" uuid REFERENCES "public"."staff_positions"("id") ON DELETE SET NULL,
          "job_id" text NOT NULL,
          "full_legal_name" text NOT NULL,
          "official_photo_url" text,
          "contact_email" text NOT NULL,
          "contact_phone" text NOT NULL,
          "department_number" integer NOT NULL,
          "department" text NOT NULL,
          "job_title" text NOT NULL,
          "county_assignment" text DEFAULT 'Nairobi' NOT NULL,
          "sub_county_assignment" text,
          "ward_assignment" text,
          "country_code" text DEFAULT 'KE' NOT NULL,
          "international_region" text,
          "employment_category" text DEFAULT 'PERMANENT' NOT NULL,
          "gender_marker" text,
          "appointment_date" text NOT NULL,
          "employment_status" text DEFAULT 'ACTIVE' NOT NULL,
          "academic_qualifications" text NOT NULL,
          "professional_certifications" text NOT NULL,
          "work_experience_summary" text NOT NULL,
          "supervisor_staff_id" text,
          "supervisor_name" text NOT NULL,
          "assigned_responsibilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
          "emergency_contact_name" text NOT NULL,
          "emergency_contact_phone" text NOT NULL,
          "emergency_contact_relation" text NOT NULL,
          "training_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
          "promotion_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
          "performance_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
          "leave_records" jsonb DEFAULT '[]'::jsonb NOT NULL,
          "appointment_documents" jsonb DEFAULT '[]'::jsonb NOT NULL,
          "exit_or_transfer_reason" text,
          "created_at" timestamptz DEFAULT now() NOT NULL,
          "updated_at" timestamptz DEFAULT now() NOT NULL
        );

        CREATE TABLE IF NOT EXISTS "public"."staff_disciplinary_records" (
          "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
          "staff_profile_id" uuid NOT NULL REFERENCES "public"."staff_employee_profiles"("id") ON DELETE CASCADE,
          "incident_ref" text NOT NULL UNIQUE,
          "category" text NOT NULL,
          "severity" text DEFAULT 'MODERATE' NOT NULL,
          "summary_enc" text NOT NULL,
          "action_taken" text NOT NULL,
          "status" text DEFAULT 'OPEN' NOT NULL,
          "logged_by_user_id" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL,
          "reviewed_by_user_id" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL,
          "created_at" timestamptz DEFAULT now() NOT NULL,
          "resolved_at" timestamptz
        );

        CREATE TABLE IF NOT EXISTS "public"."field_geography_officers" (
          "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
          "official_id_number" text NOT NULL UNIQUE,
          "staff_profile_id" uuid REFERENCES "public"."staff_employee_profiles"("id") ON DELETE SET NULL,
          "user_id" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL,
          "full_name" text NOT NULL,
          "field_role" text NOT NULL,
          "admin_level" text NOT NULL,
          "country_code" text DEFAULT 'KE' NOT NULL,
          "county" text NOT NULL,
          "sub_county" text,
          "ward" text,
          "community_unit" text,
          "supervisor_name" text NOT NULL,
          "supervisor_user_id" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL,
          "assigned_duties" jsonb DEFAULT '[]'::jsonb NOT NULL,
          "beneficiary_follow_up_count" integer DEFAULT 0 NOT NULL,
          "activities_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
          "field_reports_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
          "performance_assessment" text DEFAULT 'Meets National Field Operations Standards' NOT NULL,
          "additional_authorized_areas" jsonb DEFAULT '[]'::jsonb NOT NULL,
          "status" text DEFAULT 'ACTIVE' NOT NULL,
          "appointed_by_user_id" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL,
          "created_at" timestamptz DEFAULT now() NOT NULL,
          "updated_at" timestamptz DEFAULT now() NOT NULL
        );

        CREATE TABLE IF NOT EXISTS "public"."departmental_workspace_items" (
          "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
          "department_number" integer NOT NULL,
          "department" text NOT NULL,
          "item_type" text NOT NULL,
          "title" text NOT NULL,
          "summary" text NOT NULL,
          "status" text DEFAULT 'PENDING' NOT NULL,
          "assigned_to_name" text NOT NULL,
          "assigned_to_user_id" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL,
          "due_date" text,
          "metric_value" text,
          "metric_target" text,
          "priority" text DEFAULT 'NORMAL' NOT NULL,
          "metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
          "created_by_user_id" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL,
          "created_at" timestamptz DEFAULT now() NOT NULL,
          "updated_at" timestamptz DEFAULT now() NOT NULL
        );

        CREATE TABLE IF NOT EXISTS "public"."staff_performance_reviews" (
          "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
          "review_ref" text NOT NULL UNIQUE,
          "staff_profile_id" uuid NOT NULL REFERENCES "public"."staff_employee_profiles"("id") ON DELETE CASCADE,
          "staff_number" text NOT NULL,
          "staff_name" text NOT NULL,
          "department_number" integer NOT NULL,
          "department" text NOT NULL,
          "cadence" text DEFAULT 'MONTHLY' NOT NULL,
          "review_period" text NOT NULL,
          "objectives_summary" text NOT NULL,
          "departmental_target_ref" text NOT NULL,
          "assigned_tasks_count" integer DEFAULT 0 NOT NULL,
          "completed_activities_count" integer DEFAULT 0 NOT NULL,
          "metrics_json" jsonb NOT NULL,
          "self_assessment_text" text,
          "supervisor_assessment_text" text,
          "department_head_review_text" text,
          "hr_review_text" text,
          "improvement_plan" text,
          "recognition_commendation" text,
          "training_recommendation" text,
          "overall_rating" text DEFAULT 'MEETS_EXPECTATIONS' NOT NULL,
          "review_stage" text DEFAULT 'SELF_ASSESSMENT' NOT NULL,
          "staff_response_text" text,
          "challenge_status" text DEFAULT 'NONE' NOT NULL,
          "challenge_reason" text,
          "reviewer_user_id" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL,
          "dept_head_user_id" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL,
          "hr_reviewer_user_id" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL,
          "created_at" timestamptz DEFAULT now() NOT NULL,
          "updated_at" timestamptz DEFAULT now() NOT NULL
        );

        CREATE TABLE IF NOT EXISTS "public"."internal_staff_tasks" (
          "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
          "task_reference" text NOT NULL UNIQUE,
          "target_scope" text DEFAULT 'INDIVIDUAL' NOT NULL,
          "responsible_officer_name" text NOT NULL,
          "responsible_officer_user_id" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL,
          "department_number" integer NOT NULL,
          "department" text NOT NULL,
          "title" text NOT NULL,
          "description" text NOT NULL,
          "priority" text DEFAULT 'HIGH' NOT NULL,
          "deadline" text NOT NULL,
          "supporting_documents" jsonb DEFAULT '[]'::jsonb NOT NULL,
          "status" text DEFAULT 'PENDING' NOT NULL,
          "supervisor_name" text NOT NULL,
          "supervisor_user_id" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL,
          "completion_evidence" text,
          "review_comments" text,
          "created_at" timestamptz DEFAULT now() NOT NULL,
          "updated_at" timestamptz DEFAULT now() NOT NULL
        );

        CREATE TABLE IF NOT EXISTS "public"."internal_staff_messages" (
          "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
          "message_ref" text NOT NULL UNIQUE,
          "channel_type" text NOT NULL,
          "department_number" integer,
          "department" text,
          "title" text NOT NULL,
          "body" text NOT NULL,
          "meeting_date_time" text,
          "meeting_location_or_link" text,
          "attachment_doc_title" text,
          "sender_name" text NOT NULL,
          "sender_user_id" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL,
          "confidentiality_screened" boolean DEFAULT true NOT NULL,
          "created_at" timestamptz DEFAULT now() NOT NULL
        );

        CREATE TABLE IF NOT EXISTS "public"."staff_onboarding_checklists" (
          "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
          "onboarding_ref" text NOT NULL UNIQUE,
          "application_id" uuid REFERENCES "public"."recruitment_applications"("id") ON DELETE SET NULL,
          "staff_profile_id" uuid REFERENCES "public"."staff_employee_profiles"("id") ON DELETE SET NULL,
          "user_id" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL,
          "job_id" text NOT NULL,
          "department_number" integer NOT NULL,
          "department" text NOT NULL,
          "job_title" text NOT NULL,
          "new_hire_name_enc" text NOT NULL,
          "new_hire_email_enc" text NOT NULL,
          "overall_status" text DEFAULT 'IN_PROGRESS' NOT NULL,
          "completion_pct" integer DEFAULT 0 NOT NULL,
          "due_date" text NOT NULL,
          "milestones_json" jsonb NOT NULL,
          "activated_at" timestamptz,
          "created_by_user_id" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL,
          "created_at" timestamptz DEFAULT now() NOT NULL,
          "updated_at" timestamptz DEFAULT now() NOT NULL
        );
      `);
      await client.query('COMMIT');
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => {});
      const code = err?.code || err?.cause?.code;
      if (code === '42501') {
        console.warn('Staff establishment runtime DDL skipped due to restricted DB privileges.');
      } else {
        throw err;
      }
    } finally {
      client.release();
    }
  }

  // Ensure all 15 organisational department directory rows exist
  const [{ deptCount }] = await withDbRetry(() =>
    db
      .select({ deptCount: sql<number>`count(*)::int` })
      .from(staffDepartments)
  );

  if (deptCount < ORGANISATIONAL_DEPARTMENTS.length) {
    const deptRows = ORGANISATIONAL_DEPARTMENTS.map((dept) => {
      const leadPos = STAFF_ESTABLISHMENT_170.find((p) => p.departmentNumber === dept.number);
      return {
        departmentNumber: dept.number,
        code: dept.code,
        name: dept.name,
        plannedCount: dept.plannedCount,
        headJobId: leadPos?.jobId || null,
        workspaceFocus: DEPARTMENT_FOCUS_MAP[dept.number] || dept.name,
        isActive: true,
      };
    });
    await withDbRetry(() =>
      db
        .insert(staffDepartments)
        .values(deptRows)
        .onConflictDoNothing({ target: staffDepartments.departmentNumber })
    );
  }

  // Ensure all 170 approved establishment positions exist (batched for speed)
  const [{ posCount }] = await withDbRetry(() =>
    db
      .select({ posCount: sql<number>`count(*)::int` })
      .from(staffPositions)
  );

  if (posCount < STAFF_ESTABLISHMENT_170.length) {
    const chunkSize = 85;
    for (let i = 0; i < STAFF_ESTABLISHMENT_170.length; i += chunkSize) {
      const batch = STAFF_ESTABLISHMENT_170.slice(i, i + chunkSize);
      await withDbRetry(() =>
        db
          .insert(staffPositions)
          .values(batch)
          .onConflictDoNothing({ target: staffPositions.jobId })
      );
    }
  }
}
