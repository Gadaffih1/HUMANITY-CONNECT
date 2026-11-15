import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validatePlatformSettingUpdate,
  validateRetentionPolicyUpdate,
  type PlatformSettingRecord,
  type RetentionPolicyRecord,
} from './retentionPolicy.ts';

describe('Database Retention Policy & Cross-Browser Governance Validation', () => {
  const configurablePolicy: RetentionPolicyRecord = {
    id: '00000000-0000-0000-0000-000000000001',
    policyKey: 'PRIVATE_IDENTITY_GUARDIAN_DOCS',
    dataClass: 'Private Identity & Guardian Docs',
    retentionYears: 7,
    minimumRetentionYears: 7,
    storageTier: 'AES-256-GCM Private PostgreSQL Vault',
    disposalMethod: 'Cryptographic erasure + audit certificate',
    restrictCrossBrowserCache: true,
    statutoryLock: false,
  };

  const lockedPolicy: RetentionPolicyRecord = {
    id: '00000000-0000-0000-0000-000000000002',
    policyKey: 'FINANCIAL_LEDGER_MPESA',
    dataClass: 'Financial Ledger & M-Pesa Receipts',
    retentionYears: 10,
    minimumRetentionYears: 10,
    storageTier: 'Immutable PostgreSQL Ledger',
    disposalMethod: 'Statutory archive lock (non-deletable)',
    restrictCrossBrowserCache: true,
    statutoryLock: true,
  };

  it('rejects reducing retention years below minimum or disabling cross-browser cache restriction', () => {
    const tooShort = validateRetentionPolicyUpdate(configurablePolicy, { retentionYears: 3 });
    assert.equal(tooShort.ok, false);

    const disableCacheRestriction = validateRetentionPolicyUpdate(configurablePolicy, {
      restrictCrossBrowserCache: false,
    });
    assert.equal(disableCacheRestriction.ok, false);

    const lockedReduce = validateRetentionPolicyUpdate(lockedPolicy, { retentionYears: 9 });
    assert.equal(lockedReduce.ok, false);
  });

  it('allows raising retention years while preserving cross-browser restriction', () => {
    const valid = validateRetentionPolicyUpdate(configurablePolicy, {
      retentionYears: 12,
      restrictCrossBrowserCache: true,
    });
    assert.equal(valid.ok, true);
    if (valid.ok) {
      assert.equal(valid.next.retentionYears, 12);
      assert.equal(valid.next.restrictCrossBrowserCache, true);
    }
  });

  it('prohibits enabling browser storage or disabling HTTP no-store headers in restricted settings', () => {
    const strictSetting: PlatformSettingRecord = {
      settingKey: 'STRICT_DB_ONLY_CROSS_BROWSER_RETENTION',
      isRestricted: true,
      enforceNoBrowserStorage: true,
      valueJson: {
        allowBrowserLocalStorage: false,
        allowBrowserSessionStorage: false,
        allowIndexedDb: false,
        enforceNoStoreHeaders: true,
        sessionTtlHours: 24,
      },
    };

    const allowLs = validatePlatformSettingUpdate(strictSetting, {
      allowBrowserLocalStorage: true,
    });
    assert.equal(allowLs.ok, false);

    const disableNoStore = validatePlatformSettingUpdate(strictSetting, {
      enforceNoStoreHeaders: false,
    });
    assert.equal(disableNoStore.ok, false);

    const validUpdate = validatePlatformSettingUpdate(strictSetting, {
      sessionTtlHours: 12,
    });
    assert.equal(validUpdate.ok, true);
    if (validUpdate.ok) {
      assert.equal(validUpdate.mergedValue.sessionTtlHours, 12);
      assert.equal(validUpdate.mergedValue.allowBrowserLocalStorage, false);
      assert.equal(validUpdate.mergedValue.enforceNoStoreHeaders, true);
    }
  });
});
