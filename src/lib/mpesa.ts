import crypto from 'node:crypto';
import { MPESA_ACCOUNT, MPESA_PAYBILL } from './mpesaDestination.ts';

export class MpesaError extends Error {
  readonly status: number;
  constructor(message: string, status = 503) {
    super(message);
    this.status = status;
  }
}

export class MpesaOutcomeUnknown extends Error {
  constructor() {
    super('M-Pesa did not confirm whether it received the request. Check your phone and contact support before retrying.');
  }
}

export function normalizeMpesaPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const normalized = digits.startsWith('0') && digits.length === 10
    ? `254${digits.slice(1)}`
    : digits.startsWith('7') && digits.length === 9 ? `254${digits}` : digits;
  if (!/^254[17]\d{8}$/.test(normalized)) {
    throw new MpesaError('Enter a valid Kenyan M-Pesa number.', 400);
  }
  return normalized;
}

function config() {
  const { MPESA_ENV, MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_SHORTCODE,
    MPESA_PASSKEY, MPESA_CALLBACK_URL, MPESA_WEBHOOK_SECRET } = process.env;
  if (MPESA_ENV !== 'production' ||
      !MPESA_CONSUMER_KEY || !MPESA_CONSUMER_SECRET || MPESA_SHORTCODE !== MPESA_PAYBILL ||
      !MPESA_PASSKEY || !MPESA_CALLBACK_URL || !MPESA_WEBHOOK_SECRET ||
      MPESA_WEBHOOK_SECRET.length < 32) {
    throw new MpesaError('M-Pesa is not configured for the required paybill. Contact the administrator.');
  }
  let callback: URL;
  try {
    callback = new URL(MPESA_CALLBACK_URL);
  } catch {
    throw new MpesaError('M-Pesa callback URL is invalid.');
  }
  if (callback.protocol !== 'https:' || callback.username || callback.password ||
      callback.hash || callback.searchParams.has('token')) {
    throw new MpesaError('M-Pesa callback URL must be HTTPS and must not contain credentials, a fragment or token.');
  }
  callback.searchParams.set('token', MPESA_WEBHOOK_SECRET);
  return {
    mode: MPESA_ENV,
    baseUrl: 'https://api.safaricom.co.ke',
    key: MPESA_CONSUMER_KEY,
    secret: MPESA_CONSUMER_SECRET,
    passkey: MPESA_PASSKEY,
    callbackUrl: callback.toString(),
  };
}

export function verifyMpesaCallbackToken(token: unknown): boolean {
  const expected = process.env.MPESA_WEBHOOK_SECRET;
  if (!expected || expected.length < 32 || typeof token !== 'string') return false;
  const left = Buffer.from(token);
  const right = Buffer.from(expected);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export async function initiateMpesaStk(phone: string, amountMinor: number) {
  const msisdn = normalizeMpesaPhone(phone);
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 100 || amountMinor % 100 !== 0) {
    throw new MpesaError('M-Pesa contributions must be a whole number of Kenyan shillings.', 400);
  }
  const c = config();
  const tokenRes = await fetch(`${c.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${Buffer.from(`${c.key}:${c.secret}`).toString('base64')}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!tokenRes.ok) throw new MpesaError('M-Pesa authentication failed. Please contact the administrator.', 502);
  const token = await tokenRes.json() as { access_token?: string };
  if (!token.access_token) throw new MpesaError('M-Pesa authentication returned an invalid response.', 502);
  const timestamp = new Date(Date.now() + 3 * 60 * 60 * 1000)
    .toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  let response: Response;
  try {
    response = await fetch(`${c.baseUrl}/mpesa/stkpush/v1/processrequest`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
      BusinessShortCode: MPESA_PAYBILL,
      Password: Buffer.from(`${MPESA_PAYBILL}${c.passkey}${timestamp}`).toString('base64'),
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: amountMinor / 100,
      PartyA: msisdn,
      PartyB: MPESA_PAYBILL,
      PhoneNumber: msisdn,
      CallBackURL: c.callbackUrl,
      AccountReference: MPESA_ACCOUNT,
      TransactionDesc: 'Humanity Connect Contribution',
      }),
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    throw new MpesaOutcomeUnknown();
  }
  if (response.status >= 500) throw new MpesaOutcomeUnknown();
  let result: { CheckoutRequestID?: string; ResponseCode?: string };
  try {
    result = await response.json();
  } catch {
    throw new MpesaOutcomeUnknown();
  }
  if (response.ok && result.ResponseCode === '0' && !result.CheckoutRequestID) {
    throw new MpesaOutcomeUnknown();
  }
  if (!response.ok || result.ResponseCode !== '0') {
    throw new MpesaError('M-Pesa did not accept the payment request. No payment has been confirmed.', 502);
  }
  if (!result.CheckoutRequestID) throw new MpesaOutcomeUnknown();
  return { checkoutRequestId: result.CheckoutRequestID, phone: msisdn, mode: c.mode };
}
