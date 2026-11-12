// Client-side WebCrypto AES-GCM encrypted offline vault for Field Operations
// Sensitive drafts are encrypted in-device while offline and securely wiped immediately after server sync.

const STORAGE_KEY = 'hc_field_encrypted_vault_v1';
const KEY_STORAGE = 'hc_field_ephemeral_key_v1';

export interface OfflineFieldRecord {
  localId: string;
  recordType: 'FIELD_VISIT' | 'BENEFICIARY_INTAKE' | 'CONSENT_CAPTURE' | 'EMERGENCY_REPORT';
  county: string;
  capturedAt: string;
  payload: Record<string, unknown>;
}

interface EncryptedEnvelope {
  localId: string;
  ivB64: string;
  cipherB64: string;
  capturedAt: string;
}

async function getOrCreateLocalKey(): Promise<CryptoKey> {
  const existing = sessionStorage.getItem(KEY_STORAGE);
  if (existing) {
    const raw = Uint8Array.from(atob(existing), (c) => c.charCodeAt(0));
    return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  }
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const exported = new Uint8Array(await crypto.subtle.exportKey('raw', key));
  sessionStorage.setItem(KEY_STORAGE, btoa(String.fromCharCode(...exported)));
  return key;
}

export async function saveEncryptedOfflineRecord(record: OfflineFieldRecord): Promise<void> {
  const key = await getOrCreateLocalKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(record));
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);

  const listRaw = localStorage.getItem(STORAGE_KEY);
  const list: EncryptedEnvelope[] = listRaw ? JSON.parse(listRaw) : [];

  list.push({
    localId: record.localId,
    ivB64: btoa(String.fromCharCode(...iv)),
    cipherB64: btoa(String.fromCharCode(...new Uint8Array(cipherBuf))),
    capturedAt: record.capturedAt,
  });

  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export async function listEncryptedOfflineRecords(): Promise<OfflineFieldRecord[]> {
  const listRaw = localStorage.getItem(STORAGE_KEY);
  if (!listRaw) return [];
  const list: EncryptedEnvelope[] = JSON.parse(listRaw);
  if (list.length === 0) return [];

  const key = await getOrCreateLocalKey();
  const decrypted: OfflineFieldRecord[] = [];
  for (const item of list) {
    try {
      const iv = Uint8Array.from(atob(item.ivB64), (c) => c.charCodeAt(0));
      const cipher = Uint8Array.from(atob(item.cipherB64), (c) => c.charCodeAt(0));
      const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
      decrypted.push(JSON.parse(new TextDecoder().decode(plainBuf)) as OfflineFieldRecord);
    } catch {
      // Skip corrupted or expired session-keyed entries
    }
  }
  return decrypted;
}

export function securelyWipeOfflineRecord(localId: string): void {
  const listRaw = localStorage.getItem(STORAGE_KEY);
  if (!listRaw) return;
  const list: EncryptedEnvelope[] = JSON.parse(listRaw);
  const remaining = list.filter((x) => x.localId !== localId);
  if (remaining.length === 0) {
    localStorage.removeItem(STORAGE_KEY);
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(remaining));
  }
}

export function securelyWipeAllOfflineData(): void {
  localStorage.removeItem(STORAGE_KEY);
}
