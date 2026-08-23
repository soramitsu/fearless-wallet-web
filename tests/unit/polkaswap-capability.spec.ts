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
      'Add a SORA account to use Polkaswap.',
      'The SORA runtime is not available right now.',
      'Fund a SORA asset and enough XOR for network fees.',
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
      'This wallet is watch-only or requires an unsupported external signer.',
      'Read and accept the Polkaswap risk disclaimer.',
      'Polkaswap actions are temporarily disabled.',
    ]);
  });
});
