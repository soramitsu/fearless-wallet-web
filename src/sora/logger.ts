export const Messages = {
  connectWallet: 'You should connect wallet',
  xorOrXstIsRequired: 'You should have XOR or XSTUSD token for pair creation',
  pairAlreadyCreated: 'Token pair was already created',
  pairBaseAssetNotAllowed: 'Base asset not allowed for pair creation',
  noTransferData: 'There is no data for transfers',
  provideAccountPair: 'You should provide account pair to sign transaction',
  inabilityOfReferrerToPayFee: 'Your referrer do not have an ability to pay network fee',
  commentFieldIsTooLong: 'Comment field is too long (128 symbols allowed)',
  repayVaultDebtMoreThanDebt: 'The amount of the repay vault debt is greater than the debt itself',
  assetsNotExists: 'Assets pallet is not available in the current network',
  liquidityProxyNotExists: 'Liquidity Proxy pallet is not available in the current network',
} as const;
