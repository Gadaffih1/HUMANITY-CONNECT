import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { initiateMpesaStk, verifyMpesaCallbackToken } from './mpesa.ts';

test('STK request uses the required paybill and account, and requires authorized configuration', async () => {
  const keys = ['MPESA_ENV', 'MPESA_CONSUMER_KEY', 'MPESA_CONSUMER_SECRET', 'MPESA_SHORTCODE',
    'MPESA_PASSKEY', 'MPESA_CALLBACK_URL', 'MPESA_WEBHOOK_SECRET'] as const;
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  try {
    Object.assign(process.env, {
      MPESA_ENV: 'production',
      MPESA_CONSUMER_KEY: 'test-key',
      MPESA_CONSUMER_SECRET: 'test-secret',
      MPESA_SHORTCODE: '400200',
      MPESA_PASSKEY: 'test-passkey',
      MPESA_CALLBACK_URL: 'https://example.test/api/payments/mpesa/callback',
      MPESA_WEBHOOK_SECRET: 'test-only-secret-at-least-32-characters',
    });
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), init });
      return Response.json(calls.length === 1
        ? { access_token: 'test-access-token' }
        : { CheckoutRequestID: 'ws_CO_test', ResponseCode: '0' });
    };
    const result = await initiateMpesaStk('0712345678', 125000);
    assert.equal(result.checkoutRequestId, 'ws_CO_test');
    assert.equal(calls.length, 2);
    assert.equal(calls[1].url, 'https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest');
    const body = JSON.parse(String(calls[1].init?.body));
    assert.equal(body.BusinessShortCode, '400200');
    assert.equal(body.PartyB, '400200');
    assert.equal(body.AccountReference, '1164798');
    assert.equal(body.Amount, 1250);
    assert.equal(body.PartyA, '254712345678');
    assert.equal(new URL(body.CallBackURL).searchParams.get('token'), process.env.MPESA_WEBHOOK_SECRET);
    assert.equal(verifyMpesaCallbackToken(process.env.MPESA_WEBHOOK_SECRET), true);
    assert.equal(verifyMpesaCallbackToken('wrong'), false);

    await assert.rejects(initiateMpesaStk('0712345678', 125050), /whole number/);
    process.env.MPESA_SHORTCODE = '123456';
    await assert.rejects(initiateMpesaStk('0712345678', 125000), /not configured/);
    process.env.MPESA_SHORTCODE = '400200';
    process.env.MPESA_ENV = 'sandbox';
    await assert.rejects(initiateMpesaStk('0712345678', 125000), /not configured/);
    assert.equal(calls.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
});
