import { assert } from '@polkadot/util';
import { type TransformAccountPayload, type TokenGroup } from '@extension-base/background/types/types';
import { APIItemState } from '@extension-base/api/types/networks';
import type { InjectedAccount } from '@polkadot/extension-inject/types';
import type { SingleAddress, SubjectInfo } from '@polkadot/ui-keyring/observable/types';
import type { BalanceItem } from '@extension-base/api/evm/types/ether';
import type { NetworkJson } from '@extension-base/types';
import type { RelayChainName } from '@/interfaces';
import { MAIN_NETWORKS } from '@/consts/networks';

export function getMockCurrencies(networkMap: Record<string, NetworkJson>) {
  const networks = Object.values(networkMap);

  const currencies = networks.reduce<TokenGroup[]>((result, network) => {
    const { assets: networkAssets, name: mainNet, parentId, icon: networkIcon } = network;
    const relayChain = (networks.find(({ chainId }) => chainId === parentId)?.name ?? mainNet) as RelayChainName;
    const optionEthereum = !!network.options?.some((el) => el === 'ethereum');
    const prepRelayChain = optionEthereum ? 'ethereum' : relayChain;

    networkAssets.forEach(
      ({
        id: assetId,
        purchaseProviders,
        isUtility,
        isNative,
        type,
        symbol,
        priceId,
        precision,
        existentialDeposit,
        color,
        icon: assetIcon,
        name: tokenName,
        currencyId,
      }) => {
        const mainNetwork = MAIN_NETWORKS[symbol] ?? mainNet;

        const currencyIndex = result.findIndex(({ groupId, relayChain: _relayChain, symbol: _symbol }) => {
          const isExistingGroupId = groupId === assetId;
          const isExistingSymbol = _symbol === symbol;
          const isExistingAsset = isExistingSymbol && _relayChain === prepRelayChain;

          return isExistingGroupId || isExistingAsset;
        });

        if (currencyIndex === -1) {
          const newCurrency = {
            mainNetwork,
            groupId: assetId,
            priceId,
            symbol,
            tokenName,
            relayChain: prepRelayChain,
            icon: assetIcon,
            providers: purchaseProviders ?? [],
            balances: [],
            color,
            currencyId,
          };

          result.push(newCurrency);
        } else if (isUtility || isNative) {
          result[currencyIndex].mainNetwork = mainNetwork;
          result[currencyIndex].groupId = assetId;
        }

        // Add mock balances
        const index = currencyIndex === -1 ? result.length - 1 : currencyIndex;
        const balances: BalanceItem[] = [
          ...result[index].balances,
          {
            state: APIItemState.PENDING,
            name: mainNet.toLowerCase(),
            existentialDeposit,
            type,
            precision,
            icon: networkIcon,
            isNative,
            isUtility: isUtility ?? false,
            id: assetId,
            symbol,
          },
        ];

        result[index].balances = balances;
      }
    );

    return result;
  }, []);

  return currencies;
}

export function withErrorLog(fn: () => unknown): void {
  try {
    const p = fn();

    if (p && typeof p === 'object' && typeof (p as Promise<unknown>).catch === 'function') {
      (p as Promise<unknown>).catch(console.error);
    }
  } catch (e) {
    console.error(e);
  }
}

export function stripUrl(url: string): string {
  assert(
    url && (url.startsWith('http:') || url.startsWith('https:') || url.startsWith('ipfs:') || url.startsWith('ipns:')),
    `Invalid url ${url}, expected to start with http: or https: or ipfs: or ipns:`
  );

  const parts = url.split('/');

  return parts[2];
}

export function transformAccounts({ accounts, accountAuthType }: TransformAccountPayload): InjectedAccount[] {
  const authTypeFilter = ({ type }: SingleAddress): boolean => {
    if (accountAuthType === 'substrate') return type !== 'ethereum';
    if (accountAuthType === 'evm') return type === 'ethereum';

    return true;
  };

  return Object.values(accounts)
    .filter(authTypeFilter)
    .sort((a, b) => (a.json.meta.whenCreated || 0) - (b.json.meta.whenCreated || 0))
    .map(
      ({
        json: {
          address,
          meta: { name },
        },
        type,
      }): InjectedAccount => ({ address, name, type })
    );
}

export function transformAddresses(addresses: SubjectInfo, authType?: string): InjectedAccount[] {
  return Object.values(addresses)
    .sort((a, b) => (a.json.meta.whenCreated || 0) - (b.json.meta.whenCreated || 0))
    .map(
      ({
        json: {
          address,
          meta: { name, ethereumAddress },
        },
        type,
      }): InjectedAccount => {
        return {
          address: authType === 'evm' ? (ethereumAddress as string) : address,
          name,
          type,
          genesisHash: '',
        };
      }
    );
}
