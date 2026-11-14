import { strict as assert } from 'node:assert';
import { test } from 'node:test';

test('checkout sends a real STK request and settles only an authenticated matching callback', {
  skip: !process.env.MPESA_TEST_DATABASE_URL,
}, async () => {
  process.env.DATABASE_URL = process.env.MPESA_TEST_DATABASE_URL;
  Object.assign(process.env, {
    SESSION_SIGNING_SECRET: 'test-only-session-signing-secret',
    MPESA_ENV: 'production',
    MPESA_CONSUMER_KEY: 'test-key',
    MPESA_CONSUMER_SECRET: 'test-secret',
    MPESA_SHORTCODE: '400200',
    MPESA_PASSKEY: 'test-passkey',
    MPESA_CALLBACK_URL: 'https://example.test/api/payments/mpesa/callback',
    MPESA_WEBHOOK_SECRET: 'test-only-secret-at-least-32-characters',
  });
  const { db, pool } = await import('../db/index.ts');
  const schema = await import('../db/schema.ts');
  const { signSessionToken, sha256Hex } = await import('../lib/crypto.ts');
  const { eq } = await import('drizzle-orm');
  const express = (await import('express')).default;
  const { supporterRouter } = await import('./supporter.routes.ts');
  const { paymentsRouter } = await import('./payments.routes.ts');
  const { corporateRouter } = await import('./corporate.routes.ts');
  const nativeFetch = globalThis.fetch;
  let requestBody: Record<string, unknown> | undefined;
  let unknownOutcome = false;
  let requestCount = 0;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes('/oauth/v1/generate')) return Response.json({ access_token: 'access' });
    if (url.includes('/mpesa/stkpush/v1/processrequest')) {
      requestBody = JSON.parse(String(init?.body));
      requestCount++;
      if (unknownOutcome) throw new Error('test network timeout');
      return Response.json({ ResponseCode: '0', CheckoutRequestID: `ws_CO_test_${requestCount}` });
    }
    return nativeFetch(input, init);
  };
  const app = express();
  app.use(express.json());
  app.use('/api/supporter', supporterRouter);
  app.use('/api/payments', paymentsRouter);
  app.use('/api/corporate', corporateRouter);
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const base = `http://127.0.0.1:${address.port}`;
    const [user] = await db.insert(schema.users).values({ email: 'payer@example.test', fullName: 'Payer' }).returning();
    const [supporter] = await db.insert(schema.supporterProfiles).values({ userId: user.id, displayName: 'Payer' }).returning();
    const [fund] = await db.insert(schema.humanitarianFunds).values({
      code: 'TEST', name: 'Test fund', fundType: 'CENTRAL_RELIEF', description: 'Test',
    }).returning();
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 60000);
    const token = signSessionToken({ sid: sessionId, uid: user.id, exp: expiresAt.getTime() });
    await db.insert(schema.userSessions).values({
      id: sessionId, userId: user.id, tokenHash: sha256Hex(token),
      deviceLabel: 'Test', activeRoleCode: 'SUPPORTIVE', expiresAt,
    });
    const checkout = await fetch(`${base}/api/supporter/checkout`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        pathway: 'CENTRAL_FUND', fundId: fund.id, amountMinor: 125000,
        mode: 'MPESA_STK', phoneE164: '0712345678',
      }),
    });
    assert.equal(checkout.status, 201);
    const body = await checkout.json() as { paymentTx: { checkoutRequestId: string } };
    assert.equal(body.paymentTx.checkoutRequestId, 'ws_CO_test_1');
    assert.equal(requestBody?.BusinessShortCode, '400200');
    assert.equal(requestBody?.PartyB, '400200');
    assert.equal(requestBody?.AccountReference, '1164798');

    const callbackBody = {
      Body: { stkCallback: {
        CheckoutRequestID: 'ws_CO_test_1', ResultCode: 0,
        CallbackMetadata: { Item: [{ Name: 'Amount', Value: 1250 }, { Name: 'MpesaReceiptNumber', Value: 'TEST123' }] },
      } },
    };
    const callback = (query: string, value: unknown) => fetch(`${base}/api/payments/mpesa/callback${query}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value),
    });
    assert.equal((await callback('', callbackBody)).status, 403);
    assert.equal((await callback('?token=test-only-secret-at-least-32-characters', {
      Body: { stkCallback: { CheckoutRequestID: 'ws_CO_test_1', ResultCode: 0 } },
    })).status, 400);
    assert.equal((await callback('?token=test-only-secret-at-least-32-characters', callbackBody)).status, 200);
    assert.equal((await callback('?token=test-only-secret-at-least-32-characters', callbackBody)).status, 200);
    const [updatedFund] = await db.select().from(schema.humanitarianFunds).where(eq(schema.humanitarianFunds.id, fund.id));
    assert.equal(updatedFund.availableBalanceMinor, 125000);
    const [donation] = await db.select().from(schema.donations).where(eq(schema.donations.supporterId, supporter.id));
    assert.equal(donation.status, 'CONFIRMED');

    const direct = await fetch(`${base}/api/payments/mpesa/stk-push`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ pathway: 'CENTRAL_FUND', fundId: fund.id, amountMinor: 125000, phone: '0712345678' }),
    });
    assert.equal(direct.status, 201);
    assert.equal(requestBody?.AccountReference, '1164798');
    const batch = await fetch(`${base}/api/corporate/bulk-sponsor`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ beneficiaryIds: [crypto.randomUUID()], monthlyAmountPerBeneficiaryMinor: 125000, mode: 'MPESA_STK' }),
    });
    assert.equal(batch.status, 400);
    assert.equal(requestCount, 2);

    unknownOutcome = true;
    const unknown = await fetch(`${base}/api/supporter/checkout`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ pathway: 'CENTRAL_FUND', fundId: fund.id, amountMinor: 125000, mode: 'MPESA_STK', phoneE164: '0712345678' }),
    });
    assert.equal(unknown.status, 502);
    const [unknownTx] = await db.select().from(schema.paymentTransactions)
      .where(eq(schema.paymentTransactions.verificationStatus, 'INITIATION_UNKNOWN'));
    assert.ok(unknownTx);
  } finally {
    globalThis.fetch = nativeFetch;
    await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
    await pool.end();
  }
});
