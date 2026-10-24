import { afterEach, describe, expect, it } from 'vitest';

import {
  isBitcoinTransfersEnabled,
  isGoogleDriveBackupEnabled,
  isNetworkTransferEnabled,
  isSolanaTransfersEnabled,
} from '@/util/releaseFeatures';

const originalBitcoinFlag = process.env.VUE_APP_ENABLE_BITCOIN_TRANSFERS;
const originalSolanaFlag = process.env.VUE_APP_ENABLE_SOLANA_TRANSFERS;
const originalOauthClientId = process.env.OAUTH_CLIENT_ID;

afterEach(() => {
  if (originalSolanaFlag === undefined) delete process.env.VUE_APP_ENABLE_SOLANA_TRANSFERS;
  else process.env.VUE_APP_ENABLE_SOLANA_TRANSFERS = originalSolanaFlag;

  if (originalBitcoinFlag === undefined) delete process.env.VUE_APP_ENABLE_BITCOIN_TRANSFERS;
  else process.env.VUE_APP_ENABLE_BITCOIN_TRANSFERS = originalBitcoinFlag;

  if (originalOauthClientId === undefined) delete process.env.OAUTH_CLIENT_ID;
  else process.env.OAUTH_CLIENT_ID = originalOauthClientId;
});

describe('release feature gates', () => {
  it('enables Bitcoin transfers only for the exact reviewed true flag', () => {
    for (const value of [undefined, '', 'false', 'TRUE', '1']) {
      if (value === undefined) delete process.env.VUE_APP_ENABLE_BITCOIN_TRANSFERS;
      else process.env.VUE_APP_ENABLE_BITCOIN_TRANSFERS = value;

      expect(isBitcoinTransfersEnabled()).toBe(false);
    }

    process.env.VUE_APP_ENABLE_BITCOIN_TRANSFERS = 'true';
    expect(isBitcoinTransfersEnabled()).toBe(true);
  });

  it('removes Bitcoin networks from transfer selectors while keeping other ecosystems available', () => {
    process.env.VUE_APP_ENABLE_BITCOIN_TRANSFERS = 'false';
    expect(isNetworkTransferEnabled({ ecosystem: 'bitcoin' })).toBe(false);
    expect(isNetworkTransferEnabled({ ecosystem: 'substrate' })).toBe(true);
    expect(isNetworkTransferEnabled(undefined)).toBe(true);

    process.env.VUE_APP_ENABLE_BITCOIN_TRANSFERS = 'true';
    expect(isNetworkTransferEnabled({ ecosystem: 'bitcoin' })).toBe(true);
  });

  it('ships Solana transfers enabled and turns them off only for an explicit false or a remote veto', () => {
    delete process.env.VUE_APP_ENABLE_SOLANA_TRANSFERS;
    expect(isSolanaTransfersEnabled()).toBe(true);
    expect(isNetworkTransferEnabled({ ecosystem: 'solana' })).toBe(true);
    expect(isNetworkTransferEnabled({ ecosystem: 'solana' }, { solanaSend: false })).toBe(true);
    expect(isNetworkTransferEnabled({ ecosystem: 'solana' }, { solanaSend: true })).toBe(false);
    expect(isNetworkTransferEnabled({ ecosystem: 'substrate' }, { solanaSend: true })).toBe(true);

    process.env.VUE_APP_ENABLE_SOLANA_TRANSFERS = 'false';
    expect(isSolanaTransfersEnabled()).toBe(false);
    expect(isNetworkTransferEnabled({ ecosystem: 'solana' }, { solanaSend: false })).toBe(false);
  });

  it('exposes Google Drive backup only when a non-empty OAuth client is built in', () => {
    for (const value of [undefined, '', '   ']) {
      if (value === undefined) delete process.env.OAUTH_CLIENT_ID;
      else process.env.OAUTH_CLIENT_ID = value;

      expect(isGoogleDriveBackupEnabled()).toBe(false);
    }

    process.env.OAUTH_CLIENT_ID = 'release-client.apps.googleusercontent.com';
    expect(isGoogleDriveBackupEnabled()).toBe(true);
  });
});
