import { afterEach, describe, expect, it } from 'vitest';

import {
  isBitcoinTransfersEnabled,
  isGoogleDriveBackupEnabled,
  isIrohaConnectEnabled,
  isNetworkTransferEnabled,
  isSolanaTransfersEnabled,
} from '@/util/releaseFeatures';

const FLAGS = [
  'VUE_APP_ENABLE_BITCOIN_TRANSFERS',
  'VUE_APP_ENABLE_SOLANA_TRANSFERS',
  'VUE_APP_ENABLE_IROHA_CONNECT',
  'OAUTH_CLIENT_ID',
] as const;
const originalFlags = Object.fromEntries(FLAGS.map((flag) => [flag, process.env[flag]]));

afterEach(() => {
  FLAGS.forEach((flag) => {
    if (originalFlags[flag] === undefined) delete process.env[flag];
    else process.env[flag] = originalFlags[flag];
  });
});

const exactTrueOnly = (flag: (typeof FLAGS)[number], read: () => boolean) => {
  for (const value of [undefined, '', 'false', 'TRUE', '1']) {
    if (value === undefined) delete process.env[flag];
    else process.env[flag] = value;

    expect(read()).toBe(false);
  }

  process.env[flag] = 'true';
  expect(read()).toBe(true);
};

describe('release feature gates', () => {
  it('enables Bitcoin transfers only for the exact reviewed true flag', () => {
    exactTrueOnly('VUE_APP_ENABLE_BITCOIN_TRANSFERS', isBitcoinTransfersEnabled);
  });

  it('enables Solana transfers only for the exact reviewed true flag', () => {
    exactTrueOnly('VUE_APP_ENABLE_SOLANA_TRANSFERS', isSolanaTransfersEnabled);
  });

  it('enables IrohaConnect only for the exact reviewed true flag', () => {
    exactTrueOnly('VUE_APP_ENABLE_IROHA_CONNECT', isIrohaConnectEnabled);
  });

  it('removes Bitcoin networks from transfer selectors while keeping other ecosystems available', () => {
    process.env.VUE_APP_ENABLE_BITCOIN_TRANSFERS = 'false';
    expect(isNetworkTransferEnabled({ ecosystem: 'bitcoin' })).toBe(false);
    expect(isNetworkTransferEnabled({ ecosystem: 'substrate' })).toBe(true);
    expect(isNetworkTransferEnabled(undefined)).toBe(true);

    process.env.VUE_APP_ENABLE_BITCOIN_TRANSFERS = 'true';
    expect(isNetworkTransferEnabled({ ecosystem: 'bitcoin' })).toBe(true);
  });

  it('gates Solana networks on their own compile-time flag', () => {
    process.env.VUE_APP_ENABLE_BITCOIN_TRANSFERS = 'true';
    process.env.VUE_APP_ENABLE_SOLANA_TRANSFERS = 'false';
    expect(isNetworkTransferEnabled({ ecosystem: 'solana' })).toBe(false);
    expect(isNetworkTransferEnabled({ ecosystem: 'bitcoin' })).toBe(true);

    process.env.VUE_APP_ENABLE_SOLANA_TRANSFERS = 'true';
    expect(isNetworkTransferEnabled({ ecosystem: 'solana' })).toBe(true);
  });

  it('lets a remembered remote veto disable a compiled-on send but never enable a compiled-off one', () => {
    process.env.VUE_APP_ENABLE_BITCOIN_TRANSFERS = 'true';
    process.env.VUE_APP_ENABLE_SOLANA_TRANSFERS = 'true';

    expect(isNetworkTransferEnabled({ ecosystem: 'bitcoin' }, { bitcoinSend: true })).toBe(false);
    expect(isNetworkTransferEnabled({ ecosystem: 'solana' }, { bitcoinSend: true })).toBe(true);
    expect(isNetworkTransferEnabled({ ecosystem: 'solana' }, { solanaSend: true })).toBe(false);
    expect(isNetworkTransferEnabled({ ecosystem: 'ethereum' }, { bitcoinSend: true, solanaSend: true })).toBe(true);

    process.env.VUE_APP_ENABLE_SOLANA_TRANSFERS = 'false';
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
