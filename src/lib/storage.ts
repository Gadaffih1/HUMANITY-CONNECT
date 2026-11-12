import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { encryptSensitiveText, decryptSensitiveText, sha256Hex } from './crypto.ts';

const VAULT_ROOT = path.resolve(process.cwd(), '.private_vault');

export interface StoredObjectMeta {
  storageBucket: string;
  objectKey: string;
  checksumSha256: string;
  encryptionKeyRef: string;
  byteSize: number;
}

export async function storeEncryptedPrivateObject(params: {
  ownerUserId: string;
  category: string;
  filename: string;
  base64Content: string;
}): Promise<StoredObjectMeta> {
  await fs.mkdir(VAULT_ROOT, { recursive: true });
  const safeExt = path.extname(params.filename).replace(/[^a-zA-Z0-9.]/g, '').slice(0, 10) || '.bin';
  const objectKey = `${params.category.toLowerCase()}/${params.ownerUserId}/${crypto.randomUUID()}${safeExt}.enc`;
  const fullPath = path.join(VAULT_ROOT, objectKey);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });

  const rawBuf = Buffer.from(params.base64Content, 'base64');
  const checksumSha256 = sha256Hex(rawBuf.toString('base64'));
  const encryptedEnvelope = encryptSensitiveText(params.base64Content);
  await fs.writeFile(fullPath, encryptedEnvelope, 'utf8');

  return {
    storageBucket: 'hc-private-vault-ke',
    objectKey,
    checksumSha256,
    encryptionKeyRef: 'kms:hc-ke-envelope-v1',
    byteSize: rawBuf.byteLength,
  };
}

export async function readEncryptedPrivateObject(objectKey: string): Promise<string | null> {
  const fullPath = path.resolve(VAULT_ROOT, objectKey);
  if (!fullPath.startsWith(VAULT_ROOT)) {
    throw new Error('Invalid private object key path');
  }
  try {
    const content = await fs.readFile(fullPath, 'utf8');
    return decryptSensitiveText(content);
  } catch {
    return null;
  }
}
