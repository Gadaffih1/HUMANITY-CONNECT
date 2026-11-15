export interface RetentionPolicyRecord {
  id: string;
  policyKey: string;
  dataClass: string;
  retentionYears: number;
  minimumRetentionYears: number;
  storageTier: string;
  disposalMethod: string;
  restrictCrossBrowserCache: boolean;
  statutoryLock: boolean;
}

export interface RetentionPolicyPatch {
  retentionYears?: number;
  disposalMethod?: string;
  storageTier?: string;
  restrictCrossBrowserCache?: boolean;
}

export function validateRetentionPolicyUpdate(
  existing: RetentionPolicyRecord,
  patch: RetentionPolicyPatch
): { ok: true; next: RetentionPolicyPatch } | { ok: false; error: string } {
  const next: RetentionPolicyPatch = {};

  if (patch.retentionYears !== undefined) {
    if (!Number.isInteger(patch.retentionYears) || patch.retentionYears < 0 || patch.retentionYears > 100) {
      return { ok: false, error: 'Retention years must be an integer between 0 and 100.' };
    }
    if (patch.retentionYears < existing.minimumRetentionYears) {
      return {
        ok: false,
        error: `${existing.dataClass} requires a statutory minimum retention of ${existing.minimumRetentionYears} years.`,
      };
    }
    if (existing.statutoryLock && patch.retentionYears < existing.retentionYears) {
      return {
        ok: false,
        error: `${existing.dataClass} is under statutory archive lock and its retention period cannot be reduced.`,
      };
    }
    next.retentionYears = patch.retentionYears;
  }

  if (patch.restrictCrossBrowserCache !== undefined) {
    if (!patch.restrictCrossBrowserCache) {
      return {
        ok: false,
        error: 'Cross-browser cache restriction cannot be disabled; all data must remain strictly governed by PostgreSQL.',
      };
    }
    next.restrictCrossBrowserCache = true;
  }

  if (patch.disposalMethod !== undefined) {
    const trimmed = patch.disposalMethod.trim();
    if (trimmed.length < 6 || trimmed.length > 240) {
      return { ok: false, error: 'Disposal method description must be between 6 and 240 characters.' };
    }
    if (existing.statutoryLock && trimmed !== existing.disposalMethod) {
      return {
        ok: false,
        error: `${existing.dataClass} disposal protocol is statutorily locked and cannot be altered.`,
      };
    }
    next.disposalMethod = trimmed;
  }

  if (patch.storageTier !== undefined) {
    const trimmed = patch.storageTier.trim();
    if (trimmed.length < 4 || trimmed.length > 160) {
      return { ok: false, error: 'Storage tier must be between 4 and 160 characters.' };
    }
    if (/localstorage|sessionstorage|indexeddb|browser/i.test(trimmed) && !/zero browser/i.test(trimmed)) {
      return {
        ok: false,
        error: 'Storage tier must enforce database-backed persistence and cannot use browser-local storage.',
      };
    }
    next.storageTier = trimmed;
  }

  if (Object.keys(next).length === 0) {
    return { ok: false, error: 'No valid retention policy updates supplied.' };
  }

  return { ok: true, next };
}

export interface PlatformSettingRecord {
  settingKey: string;
  isRestricted: boolean;
  enforceNoBrowserStorage: boolean;
  valueJson: Record<string, unknown>;
}

export function validatePlatformSettingUpdate(
  existing: PlatformSettingRecord,
  patchValue: Record<string, unknown>
): { ok: true; mergedValue: Record<string, unknown> } | { ok: false; error: string } {
  if (
    existing.enforceNoBrowserStorage &&
    (patchValue.allowBrowserLocalStorage === true ||
      patchValue.allowBrowserSessionStorage === true ||
      patchValue.allowIndexedDb === true ||
      patchValue.enforceNoStoreHeaders === false)
  ) {
    return {
      ok: false,
      error:
        'Cross-browser DB-only security restriction prohibits enabling localStorage, sessionStorage, IndexedDB, or disabling HTTP no-store headers.',
    };
  }

  if (patchValue.sessionTtlHours !== undefined) {
    const ttl = Number(patchValue.sessionTtlHours);
    if (!Number.isInteger(ttl) || ttl < 1 || ttl > 168) {
      return { ok: false, error: 'Database session TTL must be between 1 and 168 hours.' };
    }
  }

  if (
    existing.settingKey === 'STUDIO_SAMPLE_CATALOG_RETENTION' &&
    (patchValue.retainVerifiedProjects === false || patchValue.retainPublishedVacancies === false)
  ) {
    return {
      ok: false,
      error: 'Retained studio sample projects and published vacancies policy cannot be disabled.',
    };
  }

  const mergedValue: Record<string, unknown> = {
    ...existing.valueJson,
    ...patchValue,
  };

  if (existing.enforceNoBrowserStorage) {
    mergedValue.allowBrowserLocalStorage = false;
    mergedValue.allowBrowserSessionStorage = false;
    mergedValue.allowIndexedDb = false;
    mergedValue.enforceNoStoreHeaders = true;
  }

  return { ok: true, mergedValue };
}
