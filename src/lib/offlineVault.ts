// Cloud SQL PostgreSQL-backed encrypted field draft vault
// Zero browser-local persistence (no localStorage / sessionStorage): all drafts remain strictly in PostgreSQL across all browsers.

export interface OfflineFieldRecord {
  localId: string;
  id?: string;
  recordType: 'FIELD_VISIT' | 'BENEFICIARY_INTAKE' | 'CONSENT_CAPTURE' | 'EMERGENCY_REPORT';
  county: string;
  caseId?: string | null;
  capturedAt: string;
  payload: Record<string, unknown>;
}

function buildHeaders(authToken?: string | null): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }
  return headers;
}

export async function saveEncryptedOfflineRecord(
  record: OfflineFieldRecord,
  authToken?: string | null
): Promise<OfflineFieldRecord> {
  const res = await fetch('/api/operations/field-drafts', {
    method: 'POST',
    credentials: 'include',
    headers: buildHeaders(authToken),
    body: JSON.stringify({
      recordType: record.recordType,
      county: record.county,
      caseId: (record.payload?.caseId as string | null | undefined) || record.caseId || null,
      payload: record.payload,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Unable to save encrypted field draft to PostgreSQL.');
  }
  return data.draft as OfflineFieldRecord;
}

export async function listEncryptedOfflineRecords(
  authToken?: string | null
): Promise<OfflineFieldRecord[]> {
  const res = await fetch('/api/operations/field-drafts', {
    method: 'GET',
    credentials: 'include',
    headers: buildHeaders(authToken),
  });
  if (!res.ok) return [];
  const data = (await res.json().catch(() => ({}))) as { drafts?: OfflineFieldRecord[] };
  return Array.isArray(data.drafts) ? data.drafts : [];
}

export async function markOfflineRecordSynced(
  draftId: string,
  authToken?: string | null
): Promise<void> {
  const res = await fetch(`/api/operations/field-drafts/${encodeURIComponent(draftId)}/mark-synced`, {
    method: 'POST',
    credentials: 'include',
    headers: buildHeaders(authToken),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Unable to mark field draft as synced in PostgreSQL.');
  }
}

export async function securelyWipeOfflineRecord(
  draftId: string,
  authToken?: string | null
): Promise<void> {
  const res = await fetch(`/api/operations/field-drafts/${encodeURIComponent(draftId)}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: buildHeaders(authToken),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Unable to delete field draft from PostgreSQL.');
  }
}
