export type AssetJson = {
  id: string;
  symbol: string;
  displayName?: string;
  chainId: string;
  precision: number;
  priceId?: string;
  icon: string;
  currencyId?: string;
  transfersEnabled?: true;
  existentialDeposit: string;
};
