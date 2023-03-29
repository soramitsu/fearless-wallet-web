type AssetJson = {
  id: string;
  name: string;
  symbol: string;
  displayName?: string;
  contractAddress?: string;
  chainId: string;
  precision: number;
  priceId?: string;
  icon: string;
  currencyId?: string;
  transfersEnabled?: true;
  existentialDeposit: string;
};

type AssetPrices = {
  /* eslint-disable */
  aed: number;
  aed_24h_change: number;
  ars: number;
  ars_24h_change: number;
  aud: number;
  aud_24h_change: number;
  bdt: number;
  bdt_24h_change: number;
  bhd: number;
  bhd_24h_change: number;
  bmd: number;
  bmd_24h_change: number;
  brl: number;
  brl_24h_change: number;
  cad: number;
  cad_24h_change: number;
  chf: number;
  chf_24h_change: number;
  clp: number;
  clp_24h_change: number;
  cny: number;
  cny_24h_change: number;
  czk: number;
  czk_24h_change: number;
  dkk: number;
  dkk_24h_change: number;
  eur: number;
  eur_24h_change: number;
  gbp: number;
  gbp_24h_change: number;
  hkd: number;
  hkd_24h_change: number;
  huf: number;
  huf_24h_change: number;
  idr: number;
  idr_24h_change: number;
  ils: number;
  ils_24h_change: number;
  inr: number;
  inr_24h_change: number;
  jpy: number;
  jpy_24h_change: number;
  krw: number;
  krw_24h_change: number;
  kwd: number;
  kwd_24h_change: number;
  lkr: number;
  lkr_24h_change: number;
  mmk: number;
  mmk_24h_change: number;
  mxn: number;
  mxn_24h_change: number;
  myr: number;
  myr_24h_change: number;
  ngn: number;
  ngn_24h_change: number;
  nok: number;
  nok_24h_change: number;
  nzd: number;
  nzd_24h_change: number;
  php: number;
  php_24h_change: number;
  pkr: number;
  pkr_24h_change: number;
  pln: number;
  pln_24h_change: number;
  rub: number;
  rub_24h_change: number;
  sar: number;
  sar_24h_change: number;
  sek: number;
  sek_24h_change: number;
  sgd: number;
  sgd_24h_change: number;
  thb: number;
  thb_24h_change: number;
  try: number;
  try_24h_change: number;
  twd: number;
  twd_24h_change: number;
  uah: number;
  uah_24h_change: number;
  usd: number;
  usd_24h_change: number;
  vef: number;
  vef_24h_change: number;
  vnd: number;
  vnd_24h_change: number;
  xdr: number;
  xdr_24h_change: number;
  zar: number;
  zar_24h_change: number;
  /* eslint-enable */
};

interface AssetPrice {
  price: number;
  priceChange: number;
}

type AssetName = string;

type AssetId = string;

type AssetsPrice = {
  tokenPriceMap: Record<string, number>;
  tokenPriceChange: Record<string, number>;
};
type KeysAssetPricesJson = keyof AssetPrices;

export { KeysAssetPricesJson, AssetsPrice, AssetName, AssetPrices, AssetPrice, AssetJson, AssetId };
