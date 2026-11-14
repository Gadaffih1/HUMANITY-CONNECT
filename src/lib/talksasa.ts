import crypto from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { talksasaSmsLogs, talksasaWebhookEvents } from '../db/schema.ts';
import {
  calculateSmsUnits,
  mapTalkSasaDlrStatus,
  maskSensitiveSmsText,
  normalizeKenyanMsisdn,
} from './talksasaUtils.ts';

export interface TalkSasaDispatchInput {
  recipientPhone: string;
  message: string;
  templateCode?: 'OTP' | 'VERIFICATION' | 'PAYMENT' | 'ONBOARDING' | 'GENERAL';
  userId?: string | null;
  idempotencyKey?: string;
  senderId?: string;
}

export interface TalkSasaDispatchResult {
  logId: string;
  dispatchRef: string;
  deliveryStatus: string;
  recipientMasked: string;
  providerUid: string | null;
  gatewayLive: boolean;
  errorReason?: string | null;
}

function getTalkSasaConfig() {
  const apiToken = (process.env.TALKSASA_API_TOKEN || '').trim();
  const apiUrl = (process.env.TALKSASA_API_URL || 'https://bulksms.talksasa.com/api/v3/sms/send').trim();
  const senderId = (process.env.TALKSASA_SENDER_ID || 'HUMANITY').trim().slice(0, 11);
  const webhookSecret = (process.env.TALKSASA_WEBHOOK_SECRET || '').trim();
  return {
    apiToken,
    apiUrl,
    senderId,
    webhookSecret,
    isConfigured: Boolean(apiToken),
  };
}

async function deliverViaTalkSasaHttp(params: {
  msisdn: string;
  senderId: string;
  message: string;
}): Promise<{
  ok: boolean;
  deliveryStatus: 'SENT' | 'FAILED' | 'SANDBOX_QUEUED';
  httpStatus: number | null;
  providerUid: string | null;
  errorReason: string | null;
  responseJson: Record<string, unknown>;
  gatewayLive: boolean;
}> {
  const cfg = getTalkSasaConfig();
  if (!cfg.isConfigured) {
    return {
      ok: true,
      deliveryStatus: 'SANDBOX_QUEUED',
      httpStatus: null,
      providerUid: null,
      errorReason: null,
      responseJson: {
        mode: 'sandbox',
        note: 'TALKSASA_API_TOKEN not set; message logged persistently without live carrier charge.',
      },
      gatewayLive: false,
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const resp = await fetch(cfg.apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipient: params.msisdn,
        sender_id: params.senderId || cfg.senderId,
        type: 'plain',
        message: params.message,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    let parsedBody: Record<string, unknown> = {};
    const rawText = await resp.text();
    try {
      parsedBody = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
    } catch {
      parsedBody = { rawBody: rawText.slice(0, 500) };
    }

    const dataObj =
      parsedBody.data && typeof parsedBody.data === 'object'
        ? (parsedBody.data as Record<string, unknown>)
        : {};
    const providerUid =
      typeof dataObj.uid === 'string'
        ? dataObj.uid
        : typeof parsedBody.uid === 'string'
          ? parsedBody.uid
          : null;

    if (!resp.ok || parsedBody.status === 'error') {
      const errText =
        (typeof parsedBody.message === 'string' && parsedBody.message) ||
        `TalkSasa HTTP ${resp.status}`;
      return {
        ok: false,
        deliveryStatus: 'FAILED',
        httpStatus: resp.status,
        providerUid,
        errorReason: errText.slice(0, 300),
        responseJson: parsedBody,
        gatewayLive: true,
      };
    }

    return {
      ok: true,
      deliveryStatus: 'SENT',
      httpStatus: resp.status,
      providerUid,
      errorReason: null,
      responseJson: parsedBody,
      gatewayLive: true,
    };
  } catch (err: any) {
    return {
      ok: false,
      deliveryStatus: 'FAILED',
      httpStatus: null,
      providerUid: null,
      errorReason: (err?.message || 'Network timeout contacting TalkSasa API').slice(0, 300),
      responseJson: { error: err?.message || 'fetch_failed' },
      gatewayLive: true,
    };
  }
}

export async function dispatchTalksasaSms(
  input: TalkSasaDispatchInput
): Promise<TalkSasaDispatchResult> {
  const norm = normalizeKenyanMsisdn(input.recipientPhone);
  if (!norm.ok) {
    throw new Error(norm.error || 'Invalid recipient phone number.');
  }

  const templateCode = input.templateCode || 'GENERAL';
  const cfg = getTalkSasaConfig();
  const senderId = (input.senderId || cfg.senderId).slice(0, 11);

  if (input.idempotencyKey) {
    const [existing] = await db
      .select()
      .from(talksasaSmsLogs)
      .where(eq(talksasaSmsLogs.idempotencyKey, input.idempotencyKey))
      .limit(1);
    if (existing) {
      return {
        logId: existing.id,
        dispatchRef: existing.dispatchRef,
        deliveryStatus: existing.deliveryStatus,
        recipientMasked: existing.recipientMasked,
        providerUid: existing.providerUid,
        gatewayLive: cfg.isConfigured,
        errorReason: existing.errorReason,
      };
    }
  }

  const dispatchRef = `SMS-${new Date().getFullYear()}-${crypto
    .randomBytes(3)
    .toString('hex')
    .toUpperCase()}`;
  const safePreview = maskSensitiveSmsText(input.message, templateCode).slice(0, 400);

  const [created] = await db
    .insert(talksasaSmsLogs)
    .values({
      dispatchRef,
      idempotencyKey: input.idempotencyKey || null,
      userId: input.userId || null,
      templateCode,
      senderId,
      recipientMsisdn: norm.msisdn,
      recipientMasked: norm.masked,
      messagePreview: safePreview,
      messageLength: input.message.length,
      smsUnits: calculateSmsUnits(input.message),
      deliveryStatus: 'QUEUED',
    })
    .returning();

  const delivery = await deliverViaTalkSasaHttp({
    msisdn: norm.msisdn,
    senderId,
    message: input.message,
  });

  const [updated] = await db
    .update(talksasaSmsLogs)
    .set({
      deliveryStatus: delivery.deliveryStatus,
      httpStatus: delivery.httpStatus,
      providerUid: delivery.providerUid,
      errorReason: delivery.errorReason,
      providerResponseJson: delivery.responseJson,
      sentAt: delivery.deliveryStatus === 'SENT' ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(talksasaSmsLogs.id, created.id))
    .returning();

  return {
    logId: updated.id,
    dispatchRef: updated.dispatchRef,
    deliveryStatus: updated.deliveryStatus,
    recipientMasked: updated.recipientMasked,
    providerUid: updated.providerUid,
    gatewayLive: delivery.gatewayLive,
    errorReason: updated.errorReason,
  };
}

export async function retryTalksasaSms(
  smsLogId: string,
  overrideMessage?: string
): Promise<TalkSasaDispatchResult> {
  const [existing] = await db
    .select()
    .from(talksasaSmsLogs)
    .where(eq(talksasaSmsLogs.id, smsLogId))
    .limit(1);

  if (!existing) {
    throw new Error('SMS log entry not found.');
  }
  if (existing.templateCode === 'OTP' && !overrideMessage) {
    throw new Error(
      'Cannot blindly replay a redacted OTP SMS; request a fresh OTP code via verification endpoint.'
    );
  }

  const msgToSend = overrideMessage || existing.messagePreview;
  const delivery = await deliverViaTalkSasaHttp({
    msisdn: existing.recipientMsisdn,
    senderId: existing.senderId,
    message: msgToSend,
  });

  const [updated] = await db
    .update(talksasaSmsLogs)
    .set({
      deliveryStatus: delivery.deliveryStatus,
      httpStatus: delivery.httpStatus,
      providerUid: delivery.providerUid || existing.providerUid,
      attemptCount: existing.attemptCount + 1,
      errorReason: delivery.errorReason,
      providerResponseJson: delivery.responseJson,
      sentAt: delivery.deliveryStatus === 'SENT' ? new Date() : existing.sentAt,
      updatedAt: new Date(),
    })
    .where(eq(talksasaSmsLogs.id, existing.id))
    .returning();

  return {
    logId: updated.id,
    dispatchRef: updated.dispatchRef,
    deliveryStatus: updated.deliveryStatus,
    recipientMasked: updated.recipientMasked,
    providerUid: updated.providerUid,
    gatewayLive: delivery.gatewayLive,
    errorReason: updated.errorReason,
  };
}

export async function processTalksasaDlrWebhook(params: {
  payload: Record<string, unknown>;
  providedSecret?: string | null;
}) {
  const cfg = getTalkSasaConfig();
  const signatureVerified = Boolean(
    cfg.webhookSecret &&
      params.providedSecret &&
      params.providedSecret === cfg.webhookSecret
  );

  if (cfg.webhookSecret && !signatureVerified) {
    await db.insert(talksasaWebhookEvents).values({
      providerUid: typeof params.payload.uid === 'string' ? params.payload.uid : null,
      eventType: 'DLR',
      deliveryStatus: 'REJECTED_AUTH',
      signatureVerified: false,
      payloadJson: params.payload,
    });
    return { accepted: false, error: 'Invalid TalkSasa webhook secret.' };
  }

  const providerUid =
    (typeof params.payload.uid === 'string' && params.payload.uid) ||
    (typeof params.payload.message_id === 'string' && params.payload.message_id) ||
    (typeof params.payload.id === 'string' && params.payload.id) ||
    null;

  const rawTo =
    (typeof params.payload.to === 'string' && params.payload.to) ||
    (typeof params.payload.recipient === 'string' && params.payload.recipient) ||
    (typeof params.payload.msisdn === 'string' && params.payload.msisdn) ||
    null;

  const rawStatus =
    (typeof params.payload.status === 'string' && params.payload.status) ||
    (typeof params.payload.delivery_status === 'string' && params.payload.delivery_status) ||
    'QUEUED';

  const mappedStatus = mapTalkSasaDlrStatus(rawStatus);
  const errorText =
    (typeof params.payload.error === 'string' && params.payload.error) ||
    (typeof params.payload.reason === 'string' && params.payload.reason) ||
    (typeof params.payload.cost === 'string' ? null : null);

  let matchedLogId: string | null = null;
  if (providerUid) {
    const [matched] = await db
      .select()
      .from(talksasaSmsLogs)
      .where(eq(talksasaSmsLogs.providerUid, providerUid))
      .limit(1);
    if (matched) matchedLogId = matched.id;
  }

  if (!matchedLogId && rawTo) {
    const norm = normalizeKenyanMsisdn(rawTo);
    if (norm.ok) {
      const [latestByPhone] = await db
        .select()
        .from(talksasaSmsLogs)
        .where(
          and(
            eq(talksasaSmsLogs.recipientMsisdn, norm.msisdn),
            eq(talksasaSmsLogs.deliveryStatus, 'SENT')
          )
        )
        .orderBy(desc(talksasaSmsLogs.createdAt))
        .limit(1);
      if (latestByPhone) matchedLogId = latestByPhone.id;
    }
  }

  if (matchedLogId) {
    await db
      .update(talksasaSmsLogs)
      .set({
        deliveryStatus: mappedStatus,
        deliveredAt: mappedStatus === 'DELIVERED' ? new Date() : undefined,
        errorReason: errorText ? String(errorText).slice(0, 300) : undefined,
        updatedAt: new Date(),
      })
      .where(eq(talksasaSmsLogs.id, matchedLogId));
  }

  const [evt] = await db
    .insert(talksasaWebhookEvents)
    .values({
      smsLogId: matchedLogId,
      providerUid,
      eventType:
        mappedStatus === 'REJECTED' ? 'BOUNCE' : 'DLR',
      deliveryStatus: mappedStatus,
      signatureVerified: cfg.webhookSecret ? signatureVerified : true,
      payloadJson: params.payload,
    })
    .returning();

  return {
    accepted: true,
    matchedLogId,
    deliveryStatus: mappedStatus,
    webhookEventId: evt.id,
  };
}

export function getTalkSasaGatewayPublicStatus() {
  const cfg = getTalkSasaConfig();
  return {
    configured: cfg.isConfigured,
    senderId: cfg.senderId,
    apiEndpoint: cfg.apiUrl,
    webhookSecretConfigured: Boolean(cfg.webhookSecret),
  };
}
