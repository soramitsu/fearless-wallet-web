export type PolkaswapCapabilityInput = {
  hasSoraAccount: boolean;
  signable: boolean;
  runtimeAvailable: boolean;
  usableAssets: boolean;
  disclaimerAccepted: boolean;
  actionEnabled: boolean;
};

export type PolkaswapCapabilityReason =
  | 'account'
  | 'signer'
  | 'runtime'
  | 'assets'
  | 'disclaimer'
  | 'disabled';

export function getPolkaswapCapabilityReasons(input: PolkaswapCapabilityInput): PolkaswapCapabilityReason[] {
  const reasons: PolkaswapCapabilityReason[] = [];

  if (!input.hasSoraAccount) reasons.push('account');
  else if (!input.signable) reasons.push('signer');
  if (!input.runtimeAvailable) reasons.push('runtime');
  if (!input.usableAssets) reasons.push('assets');
  if (!input.disclaimerAccepted) reasons.push('disclaimer');
  if (!input.actionEnabled) reasons.push('disabled');

  return reasons;
}
