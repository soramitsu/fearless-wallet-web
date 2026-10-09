import { getPolkaswapCapabilityReasons } from '@/defi/polkaswapCapability';

const available = {
  actionEnabled: true,
  disclaimerAccepted: true,
  hasSoraAccount: true,
  runtimeAvailable: true,
  signable: true,
  usableAssets: true,
};

describe('Polkaswap capability state', () => {
  it('allows actions only when every runtime, account, asset, disclaimer and rollout gate passes', () => {
    expect(getPolkaswapCapabilityReasons(available)).toEqual([]);
  });

  it('shows an additive SORA setup state for a wallet from another ecosystem', () => {
    expect(
      getPolkaswapCapabilityReasons({
        ...available,
        hasSoraAccount: false,
        runtimeAvailable: false,
        usableAssets: false,
      })
    ).toEqual([
      'account',
      'runtime',
      'assets',
    ]);
  });

  it('distinguishes watch-only, disclaimer and remote kill-switch failures', () => {
    expect(
      getPolkaswapCapabilityReasons({
        ...available,
        actionEnabled: false,
        disclaimerAccepted: false,
        signable: false,
      })
    ).toEqual([
      'signer',
      'disclaimer',
      'disabled',
    ]);
  });
});
