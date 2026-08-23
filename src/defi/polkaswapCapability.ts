export type PolkaswapCapabilityInput = {
  hasSoraAccount: boolean;
  signable: boolean;
  runtimeAvailable: boolean;
  usableAssets: boolean;
  disclaimerAccepted: boolean;
  actionEnabled: boolean;
};

export function getPolkaswapCapabilityReasons(input: PolkaswapCapabilityInput): string[] {
  const reasons: string[] = [];

  if (!input.hasSoraAccount) reasons.push('Add a SORA account to use Polkaswap.');
  else if (!input.signable) reasons.push('This wallet is watch-only or requires an unsupported external signer.');
  if (!input.runtimeAvailable) reasons.push('The SORA runtime is not available right now.');
  if (!input.usableAssets) reasons.push('Fund a SORA asset and enough XOR for network fees.');
  if (!input.disclaimerAccepted) reasons.push('Read and accept the Polkaswap risk disclaimer.');
  if (!input.actionEnabled) reasons.push('Polkaswap actions are temporarily disabled.');

  return reasons;
}
