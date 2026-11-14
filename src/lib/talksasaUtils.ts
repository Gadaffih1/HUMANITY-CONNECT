export interface NormalizedMsisdnResult {
  ok: boolean;
  msisdn: string; // e.g. 254712345678 (TalkSasa format without '+')
  e164: string; // e.g. +254712345678 (DB canonical E.164)
  masked: string; // e.g. 254712****78
  error?: string;
}

/**
 * Normalizes Kenyan and international phone inputs into TalkSasa's required MSISDN format
 * (e.g. "254712345678" without leading '+') and canonical DB E.164 ("+254712345678").
 * Prevents TalkSasa HTTP 422 errors caused by "+254...", "07...", "01...", "+25407...", or spaces/dashes.
 */
export function normalizeKenyanMsisdn(rawPhone?: string | null): NormalizedMsisdnResult {
  if (!rawPhone || typeof rawPhone !== 'string') {
    return { ok: false, msisdn: '', e164: '', masked: '', error: 'Phone number is required.' };
  }

  let digits = rawPhone.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (digits.startsWith('00')) digits = digits.slice(2);

  // Fix common Kenyan prefix mistakes like 2540712345678 or 2540112345678
  if (digits.startsWith('2540') && digits.length === 13) {
    digits = `254${digits.slice(4)}`;
  }

  // Local 07XXXXXXXX or 01XXXXXXXX -> 2547XXXXXXXX / 2541XXXXXXXX
  if (digits.startsWith('0') && digits.length === 10 && (digits[1] === '7' || digits[1] === '1')) {
    digits = `254${digits.slice(1)}`;
  }

  // Bare 9-digit Kenyan subscriber number 7XXXXXXXX / 1XXXXXXXX
  if (digits.length === 9 && (digits[0] === '7' || digits[0] === '1')) {
    digits = `254${digits}`;
  }

  if (digits.startsWith('254') && !/^254[71]\d{8}$/.test(digits)) {
    return {
      ok: false,
      msisdn: '',
      e164: '',
      masked: '',
      error: 'Kenyan mobile numbers must be valid 2547XXXXXXXX or 2541XXXXXXXX digits.',
    };
  }

  if (!/^\d{10,15}$/.test(digits)) {
    return {
      ok: false,
      msisdn: '',
      e164: '',
      masked: '',
      error: 'Invalid phone number length (expected 10–15 digits).',
    };
  }

  const masked =
    digits.length >= 8
      ? `${digits.slice(0, 6)}****${digits.slice(-2)}`
      : `${digits.slice(0, 3)}****`;

  return {
    ok: true,
    msisdn: digits,
    e164: `+${digits}`,
    masked,
  };
}

export function maskSensitiveSmsText(message: string, templateCode: string): string {
  const trimmed = message.trim();
  if (templateCode === 'OTP') {
    return trimmed.replace(/\b\d{4,8}\b/g, '******');
  }
  return trimmed;
}

export function calculateSmsUnits(message: string): number {
  if (!message) return 0;
  // Detect any non-GSM basic characters (emojis, smart quotes, etc.) -> UCS-2 (70/67 limit)
  const isUnicode = /[^\x20-\x7E\r\n£¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ€]/.test(message);
  if (isUnicode) {
    return message.length <= 70 ? 1 : Math.ceil(message.length / 67);
  }
  return message.length <= 160 ? 1 : Math.ceil(message.length / 153);
}

export type TalkSasaDeliveryStatus =
  | 'QUEUED'
  | 'SENT'
  | 'DELIVERED'
  | 'FAILED'
  | 'REJECTED'
  | 'SANDBOX_QUEUED';

export function mapTalkSasaDlrStatus(rawStatus?: string | null): TalkSasaDeliveryStatus {
  const norm = String(rawStatus || '')
    .trim()
    .toUpperCase();
  if (['DELIVERED', 'DELIVRD', 'SUCCESS', 'COMPLETED'].includes(norm)) return 'DELIVERED';
  if (['REJECTED', 'UNDELIVERED', 'UNDELIV', 'DND', 'BLOCKED', 'EXPIRED'].includes(norm)) {
    return 'REJECTED';
  }
  if (['FAILED', 'ERROR', 'FAIL'].includes(norm)) return 'FAILED';
  if (['SENT', 'SUBMITTED', 'DISPATCHED'].includes(norm)) return 'SENT';
  return 'QUEUED';
}
