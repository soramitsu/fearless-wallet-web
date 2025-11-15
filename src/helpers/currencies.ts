import { APIItemState } from '@extension-base/api/types/networks';
import { getBalanceNetworkName } from '@extension-base/api/evm/types';
import type { NetworkFilter, NetworkName, BuyProvider, FiatJson } from '@/interfaces';
import type { NetworkJson } from '@extension-base/types';
import type { BalanceItem } from '@extension-base/api/evm/types';
import type { BasePriceJson, TokenGroup } from '@extension-base/background/types/types';
import { FPNumber } from '@/lib/fpNumber';
import { getNativeAssetName } from '@/extension/background/extension-base/src/background/handlers/utils';
import { SORA_NETWORK_NAME, SORA_UTILITY_ASSET } from '@/consts/sora';
import { RAMP_API_KEY, MOONPAY_API_KEY } from '@/consts/global';
import { BASE_URLS_PREFIX } from '@/consts/urls';
import { isSora } from '@/helpers';
import { getSummaryTransferableBalance } from '@/helpers/common';
import {
  createNetworkSelectionContext,
  createNetworkGroupingIndex,
  networkMatchesSelection,
  type NetworkGroupingIndex,
  type NetworkSelectionContext,
} from '@/helpers/networkGroups';
import { balanceMatchesNetwork, findBalanceByNetwork } from '@/helpers/balances';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

const normalizeFilterValue = (value: string) => value.trim().toLowerCase();

export type FiatOption = {
  name: string;
  value: string;
  icon?: string;
  symbol: string;
};

export interface FiatMetadataIndex {
  options: FiatOption[];
  byId: Map<string, FiatOption>;
  bySymbol: Map<string, FiatOption>;
}

export interface AssetTagIndex {
  tagsByKey: Map<string, string[]>;
  getTags(token: TokenGroup): string[];
  matches(token: TokenGroup, filter: string): boolean;
}

export interface WalletMetadataIndex {
  networkIndex: NetworkGroupingIndex;
  selection: NetworkSelectionContext;
  assetTags: AssetTagIndex;
  fiatMetadata: FiatMetadataIndex;
}

export type WalletMetadataOptions = {
  tokenGroups?: TokenGroup[];
  fiats?: FiatJson[];
  fiatFilter?: string;
  networks?: NetworkJson[];
  selection?: NetworkFilter;
  favoriteAddress?: string;
};

export function getTransferableBalanceInNetwork(token: TokenGroup, network: NetworkName) {
  const balance = findBalanceByNetwork(token.balances, network);

  return balance?.transferable ?? '0';
}

function defaultSortingCurrencies(currencies: TokenGroup[], { tokenPriceMap }: BasePriceJson, network: NetworkFilter) {
  const networksStore = useNetworksStore();
  const accountsStore = useAccountsStore();

  const relayChains: TokenGroup[] = [];
  const pending: TokenGroup[] = [];
  const errored: TokenGroup[] = [];
  const withAssetsAndFiat: TokenGroup[] = [];
  const withAssetsAndNoFiat: TokenGroup[] = [];
  const withoutAssets: TokenGroup[] = [];

  const metrics = new Map<
    TokenGroup,
    {
      transferable: number;
      price: number;
    }
  >();

  currencies.forEach((currency) => {
    const { balances, priceId } = currency;

    if (balances.every(({ state }) => state === APIItemState.PENDING)) {
      pending.push(currency);

      return;
    }

    if (balances.every(({ state }) => state === APIItemState.ERROR)) {
      errored.push(currency);

      return;
    }

    const transferable = +getSummaryTransferableBalance(currency, network, {
      networks: networksStore.networks,
      favoriteAddress: accountsStore.selectedWallet.address,
    });
    const hasAssets = balances.some(({ total }) => total !== '0');
    const price = tokenPriceMap[priceId ?? ''] ?? 0;

    metrics.set(currency, { transferable, price });

    if (!hasAssets) {
      if (currency.symbol === 'dot' || currency.symbol === 'ksm') relayChains.push(currency);
      else withoutAssets.push(currency);

      return;
    }

    if (price !== 0) withAssetsAndFiat.push(currency);
    else withAssetsAndNoFiat.push(currency);
  });

  const sortByFiatBalanceDesc = (a: TokenGroup, b: TokenGroup) => {
    const metaA = metrics.get(a);
    const metaB = metrics.get(b);

    if (!metaA || !metaB) return 0;

    return metaB.transferable * metaB.price - metaA.transferable * metaA.price;
  };

  const sortByTransferableDesc = (a: TokenGroup, b: TokenGroup) => {
    const metaA = metrics.get(a);
    const metaB = metrics.get(b);

    if (!metaA || !metaB) return 0;

    return metaB.transferable - metaA.transferable;
  };

  withAssetsAndFiat.sort(sortByFiatBalanceDesc);
  withAssetsAndNoFiat.sort(sortByTransferableDesc);
  withoutAssets.sort(({ symbol: symbol1 }, { symbol: symbol2 }) => symbol1.localeCompare(symbol2));

  return [...withAssetsAndFiat, ...withAssetsAndNoFiat, ...relayChains, ...withoutAssets, ...pending, ...errored];
}

function getProviderUrl(name: BuyProvider, asset: string, address: string) {
  const { MOONPAY, RAMP } = BASE_URLS_PREFIX;

  const provider = {
    moonpay: `${MOONPAY}/?apiKey=${MOONPAY_API_KEY}&currencyCode=${asset.toLowerCase()}&walletAddress=${address}&showWalletAddressForm=true`,
    ramp: `${RAMP}/?swapAsset=${asset.toUpperCase()}&userAddress=${address}&hostApiKey=${RAMP_API_KEY}`,
  };

  return provider[name];
}

function getCurrencyOptions(tokenGroup: TokenGroup[]) {
  return tokenGroup.map(({ groupId, symbol: _symbol, icon, relayChain, tokenName }) => {
    const assetUpper = _symbol.toUpperCase();
    const filteredOptions = tokenGroup.filter(({ symbol }) => symbol === _symbol);
    const label = filteredOptions.length > 1 ? `${assetUpper} (${relayChain.toUpperCase()})` : assetUpper;

    return {
      name: getNativeAssetName(label).toUpperCase(),
      value: groupId,
      subName: tokenName,
      icon,
    };
  });
}

function buildFiatMetadataIndex(fiats: FiatJson[], filter = ''): FiatMetadataIndex {
  const normalizedFilter = normalizeFilterValue(filter);
  const options: FiatOption[] = [];
  const byId = new Map<string, FiatOption>();
  const bySymbol = new Map<string, FiatOption>();

  fiats.forEach(({ name, id, icon, symbol }) => {
    const option: FiatOption = {
      name,
      value: id,
      icon,
      symbol,
    };

    byId.set(id.toLowerCase(), option);
    bySymbol.set(symbol.toLowerCase(), option);

    if (!normalizedFilter) {
      options.push(option);

      return;
    }

    const candidates = [name, id, symbol].map(normalizeFilterValue);

    if (candidates.some((candidate) => candidate.includes(normalizedFilter))) {
      options.push(option);
    }
  });

  return {
    options,
    byId,
    bySymbol,
  };
}

function buildFiatOptions(fiats: FiatJson[], filter = '') {
  return buildFiatMetadataIndex(fiats, filter).options;
}

function getUtilityAsset(balances: TokenGroup[], _network: NetworkName) {
  return balances.find(({ balances }) =>
    balances.some((balance) => balance.isUtility && balanceMatchesNetwork(balance, _network))
  )!;
}

const getXORCurrency = (balances: TokenGroup[]) => {
  return balances.find(({ symbol }) => symbol === SORA_UTILITY_ASSET && isSora(SORA_NETWORK_NAME))!;
};

function calcTransferableSendMinusFee(
  currency: TokenGroup | undefined,
  network: NetworkName,
  fee: string,
  checkED = false,
  destNetFee?: string
) {
  if (currency === undefined) return '0';

  const isCrossChain = destNetFee !== undefined;

  const currencyBalance = currency.balances.find((balance) => balanceMatchesNetwork(balance, network))!;
  const precision = currencyBalance.precision;
  const transferable = currencyBalance.transferable ?? '0';

  const transferableFP = new FPNumber(transferable, precision);
  const destNetFeeFP = new FPNumber(destNetFee ?? 0, precision);

  // ED берем с запасом + 10%
  const existentialDeposit = FPNumber.fromCodecValue(currencyBalance.existentialDeposit ?? '0', precision).mul(
    new FPNumber(1.1, precision)
  );

  // Для Utility ассета вычитаем origin fee, тк origin fee всегда списывается в Utility ассете
  // также проверяем existentialDeposit и дополнительно оставляем на балансе 10% от комисии
  if (currencyBalance.isUtility) {
    const amountSubFee = transferableFP.sub(new FPNumber(fee, precision));
    const amountSubFeeSubDestFee = isCrossChain ? amountSubFee.sub(destNetFeeFP) : amountSubFee;
    const amountSubFeeSubDestFeeSubED = checkED
      ? amountSubFeeSubDestFee.sub(existentialDeposit)
      : amountSubFeeSubDestFee;

    return FPNumber.lt(amountSubFeeSubDestFeeSubED, FPNumber.ZERO) ? '0' : amountSubFeeSubDestFeeSubED.toString();
  }

  // вычитаем CrossChain комиссию и проверяем existentialDeposit для ORML ассета
  if (isCrossChain) {
    const amountSubDestFee = transferableFP.sub(destNetFeeFP);
    const amountSubDestFeeSubED = checkED ? amountSubDestFee.sub(existentialDeposit) : amountSubDestFee;

    return FPNumber.lt(amountSubDestFeeSubED, FPNumber.ZERO) ? '0' : amountSubDestFeeSubED.toString();
  }

  return transferable;
}

function isValidAmountAsset(
  currency: TokenGroup | undefined,
  network: NetworkName,
  fee: string,
  amount: string,
  checkED = false,
  destFee?: string
) {
  const maxSendFP = new FPNumber(calcTransferableSendMinusFee(currency, network, fee, checkED, destFee));

  // если sendAsset !== Utility, то: если количество токенов равно нулю, то транзакция невалидна
  // если  sendAsset === Utility, то: если количество токенов за вычетом комиссии равно нулю, то транзакция невалидна
  if (FPNumber.isEqualTo(maxSendFP, FPNumber.ZERO)) return false;

  // если syncedAmount меньше или равен максимальному количеству токенов, то транзакция валидна
  return FPNumber.lte(new FPNumber(amount), maxSendFP);
}

function filterBalanceItemsByNetwork(balance: BalanceItem, selection: NetworkSelectionContext) {
  return networkMatchesSelection(selection, getBalanceNetworkName(balance));
}

function deriveAssetTags(token: TokenGroup): string[] {
  const tags = new Set<string>();
  const push = (value?: string | null) => {
    if (!value) return;

    tags.add(value.toLowerCase());
  };

  push(token.groupId);
  push(token.tokenName);
  push(token.symbol);
  push(token.relayChain);
  push(token.mainNetwork);

  token.balances.forEach((balance) => {
    push(getBalanceNetworkName(balance));
    push(balance.relayChain);
    push(balance.chain);
    push(balance.chainHash);

    if (balance.type) push(balance.type);
    if (balance.isUtility) tags.add('utility');
    if (balance.isNative) tags.add('native');
  });

  return Array.from(tags);
}

const getTokenKey = (token: TokenGroup) => token.groupId ?? token.symbol ?? token.tokenName ?? token.mainNetwork ?? '';

function createAssetTagIndex(tokenGroups: TokenGroup[]): AssetTagIndex {
  const tagsByKey = new Map<string, string[]>();

  const ensure = (token: TokenGroup) => {
    const key = getTokenKey(token);

    if (key && tagsByKey.has(key)) {
      return tagsByKey.get(key)!;
    }

    const tags = deriveAssetTags(token);

    if (key) tagsByKey.set(key, tags);

    return tags;
  };

  tokenGroups.forEach((token) => {
    const key = getTokenKey(token);

    if (!key || tagsByKey.has(key)) return;

    tagsByKey.set(key, deriveAssetTags(token));
  });

  return {
    tagsByKey,
    getTags: (token: TokenGroup) => ensure(token),
    matches: (token: TokenGroup, filter: string) => {
      const normalizedFilter = normalizeFilterValue(filter);

      if (!normalizedFilter) return true;

      return ensure(token).some((tag) => tag.includes(normalizedFilter));
    },
  };
}

const resolveWalletMetadataOptions = (options: WalletMetadataOptions = {}) => {
  const networksStore = useNetworksStore();
  const accountsStore = useAccountsStore();

  return {
    tokenGroups: options.tokenGroups ?? accountsStore.balances,
    fiats: options.fiats ?? networksStore.fiats,
    fiatFilter: options.fiatFilter ?? '',
    networks: options.networks ?? networksStore.networks,
    selection: options.selection ?? accountsStore.selectedNetwork,
    favoriteAddress: options.favoriteAddress ?? accountsStore.selectedWallet.address,
  };
};

function createWalletMetadataIndex(options: WalletMetadataOptions = {}): WalletMetadataIndex {
  const { tokenGroups, fiats, fiatFilter, networks, selection, favoriteAddress } =
    resolveWalletMetadataOptions(options);

  const networkIndex = createNetworkGroupingIndex(networks, selection, { favoriteAddress });
  const assetTags = createAssetTagIndex(tokenGroups);
  const fiatMetadata = buildFiatMetadataIndex(fiats, fiatFilter);

  return {
    networkIndex,
    selection: networkIndex.selection,
    assetTags,
    fiatMetadata,
  };
}

export {
  getCurrencyOptions,
  getProviderUrl,
  defaultSortingCurrencies,
  getUtilityAsset,
  getXORCurrency,
  calcTransferableSendMinusFee,
  isValidAmountAsset,
  filterBalanceItemsByNetwork,
  buildFiatOptions,
  buildFiatMetadataIndex,
  deriveAssetTags,
  createAssetTagIndex,
  createWalletMetadataIndex,
};

export { getSummaryTransferableBalanceFilteredByActiveNetworks } from '@/helpers/common';
