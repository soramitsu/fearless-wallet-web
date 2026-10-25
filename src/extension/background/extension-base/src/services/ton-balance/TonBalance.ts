import { APIItemState } from '@extension-base/api/types/networks';
import { Address } from '@ton/core';
import { reconcileSuccessfulDynamicScan } from '@extension-base/services/balance-service/reconcileSuccessfulScan';
import { TonProviderError, type TonProviderRouter } from '@extension-base/services/ton-provider';
import { type ResponseBalanceRequest, type TonImportCandidateInfo } from '../../background/types/types';
import type { BalanceItem } from '@extension-base/api/evm/types';
import type { BasePriceJson } from '@extension-base/background/types/types';
import type { NetworkName } from '@/interfaces';
import type State from '@extension-base/background/handlers/State';
import { FPNumber } from '@/sora/number';
import { TON_MAINNET } from '@/consts/networks';
import { isSameString, isTonMainnet } from '@/helpers';
import { createAssetKey } from '@/portfolio/assetIdentity';

// How long the import screen waits for an address lookup before it shows the balance as unavailable.
const ADDRESS_ACTIVITY_TIMEOUT_MS = 6_000;

type TonAddressActivityResult = Pick<TonImportCandidateInfo, 'activity' | 'balance'>;

type TonBalanceResult = {
  /** Undefined when no provider answered and nothing was ever loaded: shown as unavailable, never as zero. */
  balance?: string;
  state: APIItemState;
};

type TonJettonBalanceResult = {
  balance: string;
  image: string;
  name: string;
  precision: number;
  symbol: string;
  assetId: string;
  priceId?: string;
  priceAssetKey?: string;
  assetMetadataTrust: NonNullable<BalanceItem['assetMetadataTrust']>;
  assetMetadataSource: NonNullable<BalanceItem['assetMetadataSource']>;
  walletAddress?: BalanceItem['walletAddress'];
  state: APIItemState;
};

type TonJettonScanResult = {
  balances: TonJettonBalanceResult[];
  /** The provider answered and listed every jetton the address holds. */
  complete: boolean;
  /** The provider answered, but lists only the jettons it indexes (TI). */
  partial: boolean;
};

export class TonBalance {
  constructor(private readonly state: State) {}

  async fetchBalance(address: string, networks: NetworkName[]): Promise<ResponseBalanceRequest[]> {
    const promises: Promise<ResponseBalanceRequest[]>[] = networks.map(async (networkKey) => {
      const {
        assets,
        chainId,
        ecosystem,
        name: networkName,
        icon,
      } = this.state.networkService.networksGithub.find(({ name }) => isSameString(name, networkKey))!;

      const { precision, symbol, id: tonId, priceId } = assets[0];

      const tonBalance = await this.fetchUtilityAsset(address, networkKey, precision, tonId);

      const jettonScan = await this.fetchJettonsAsset(address, networkKey);
      const jettonsBalance = jettonScan.balances;
      const scanCoverage = jettonScan.partial ? 'limited' : 'complete';

      this.state.balanceService.setBalanceItem(
        networkName,
        {
          state: tonBalance.state,
          precision,
          relayChain: networkName.toLowerCase(),
          symbol,
          id: tonId,
          priceId,
          priceAssetKey: priceId
            ? createAssetKey({
                ecosystem: String(ecosystem ?? 'ton'),
                chainId: String(chainId || networkName),
                assetId: tonId,
              })
            : undefined,
          assetMetadataTrust: 'verified',
          assetMetadataSource: 'registry',
          scanCoverage,
          total: tonBalance.balance,
          transferable: tonBalance.balance,
        },
        address
      );

      jettonsBalance.forEach(({
        balance,
        image,
        name,
        precision,
        symbol,
        assetId,
        priceId,
        priceAssetKey,
        walletAddress,
        state,
        assetMetadataTrust,
        assetMetadataSource,
      }) => {
        this.state.balanceService.setBalanceItem(
          networkName,
          {
            state,
            precision,
            relayChain: networkName.toLowerCase(),
            assetIcon: image,
            icon,
            id: assetId,
            priceId,
            priceAssetKey,
            name,
            symbol,
            assetMetadataTrust,
            assetMetadataSource,
            scanCoverage,
            total: balance,
            transferable: balance,
            walletAddress,
          },
          address
        );
      });

      // Only a complete list proves a jetton is gone; after a failure or from TI's partial list it keeps its balance.
      if (jettonScan.complete) {
        reconcileSuccessfulDynamicScan(this.state, {
          address,
          network: networkName,
          observedAssetIds: jettonsBalance.map(({ assetId }) => assetId),
          includes: ({ type }) => type === 'jetton',
        });
      }

      return [
        ...(tonBalance.balance === undefined
          ? []
          : [
              {
                balance: tonBalance.balance,
                network: networkName,
                assetId: tonId,
              },
            ]),
        ...jettonsBalance.map(({ balance, assetId }) => ({
          balance,
          network: networkName,
          assetId,
        })),
      ];
    });

    return (await Promise.all(promises)).flat();
  }

  /** What TON mainnet reports for addresses that are not in the wallet yet (the import chooser).
   * Read-only and best effort: a failed, slow or unavailable lookup is `unknown`, never a guess,
   * and nothing is written to the balance cache. The answer comes from the same verified provider
   * as balances (TI once it proves TON mainnet, the registry node until then). */
  async fetchAddressActivity(addresses: string[]): Promise<Record<string, TonAddressActivityResult>> {
    const unknown = (): Record<string, TonAddressActivityResult> =>
      Object.fromEntries(addresses.map((address) => [address, { activity: 'unknown' }]));
    const network = this.state.networkService.networksGithub.find(({ name }) => isTonMainnet(name));

    if (!network) return unknown();

    // A wallet without a TON account has no TON client yet; one made for this lookup is removed again.
    const hadApi = !!this.state.getTonApiMap[TON_MAINNET];

    try {
      if (!hadApi) await this.state.networkService.tonApiHandler.initApi(network);

      const api = this.state.getTonApiMap[TON_MAINNET]?.api;

      if (!api) return unknown();

      const precision = network.assets[0].precision;
      const lookups = addresses.map(async (address): Promise<[string, TonAddressActivityResult]> => {
        try {
          const { balance, hasActivity } = await withTimeout(
            api.getAccountBalance(Address.parse(address)),
            ADDRESS_ACTIVITY_TIMEOUT_MS
          );

          return [
            address,
            {
              activity: hasActivity ? 'active' : 'empty',
              balance: FPNumber.fromCodecValue(balance.toString(), precision).toString(),
            },
          ];
        } catch (error) {
          console.warn('[TON][fetchAddressActivity] Lookup failed', error);

          return [address, { activity: 'unknown' }];
        }
      });

      return Object.fromEntries(await Promise.all(lookups));
    } catch (error) {
      console.warn('[TON][fetchAddressActivity] Lookup failed', error);

      return unknown();
    } finally {
      if (!hadApi) this.state.networkService.tonApiHandler.destroyApi(network.name);
    }
  }

  async fetchUtilityAsset(
    address: string,
    networkName: NetworkName,
    precision: number,
    assetId: string
  ): Promise<TonBalanceResult> {
    try {
      const walletContract = this.getWalletContract(address);
      const { balance } = await this.provider(networkName).getAccountBalance(walletContract.address);

      const balanceFP = FPNumber.fromCodecValue(balance.toString(), precision);

      console.info(`[TON] TON ${address}: `, balanceFP.toString());

      return { balance: balanceFP.toString(), state: APIItemState.READY };
    } catch (error) {
      console.error('[TON][fetchUtilityAsset] Error', error);

      // The last balance a provider confirmed, marked as failed; without one the balance is unknown, not zero.
      return {
        balance: this.getCachedBalance(address, networkName, assetId),
        state: APIItemState.ERROR,
      };
    }
  }

  async fetchJettonsAsset(address: string, networkName: NetworkName): Promise<TonJettonScanResult> {
    try {
      const network = this.state.networkService.networksGithub.find(({ name }) =>
        isSameString(name, networkName)
      );

      const walletContract = this.getWalletContract(address);

      const { holdings, complete } = await this.provider(networkName).getJettonBalances(
        walletContract.address,
        this.state.pricesService.fiatSymbol
      );

      const prices: BasePriceJson = { tokenPriceMap: {}, tokenPriceChange: {} };

      const prepareBalances = holdings.map<TonJettonBalanceResult>((holding) => {
        const { balance, master, decimals, image, symbol, name, verified, wallet: walletAddress } = holding;

        const symbolLower = symbol.toLowerCase();
        const masterAddress = master.toString();

        if (verified && holding.price) {
          const { price, diff24 } = this.state.pricesService.tonPricingService.tonParseRates(holding.price);
          prices.tokenPriceChange[masterAddress] = diff24;
          prices.tokenPriceMap[masterAddress] = price;
        }

        const balanceFP = FPNumber.fromCodecValue(balance.toString(), decimals);

        return {
          balance: balanceFP.toString(),
          precision: decimals,
          symbol: symbolLower,
          walletAddress,
          image,
          name,
          assetId: masterAddress,
          priceId: verified ? masterAddress : undefined,
          priceAssetKey: verified && network
            ? createAssetKey({
                ecosystem: String(network.ecosystem),
                chainId: String(network.chainId || network.name),
                assetId: masterAddress,
              })
            : undefined,
          assetMetadataTrust: verified ? 'verified' : 'unverified',
          assetMetadataSource: 'indexer',
          state: APIItemState.READY,
        };
      });

      this.state.pricesService.setPriceValue(prices);

      return { balances: prepareBalances, complete, partial: !complete };
    } catch (error) {
      console.error('[TON][fetchJettonsAsset] Error', error);

      return { balances: this.getCachedJettonBalances(address, networkName), complete: false, partial: false };
    }
  }

  private provider(networkName: NetworkName): TonProviderRouter {
    const provider = this.state.getTonApiMap[networkName.toLowerCase()]?.api;

    if (!provider) throw new TonProviderError('ton_provider_unavailable', `no TON provider for ${networkName}`);

    return provider;
  }

  private getCachedBalance(address: string, networkName: NetworkName, assetId: string): string | undefined {
    const cachedBalance = this.getCachedBalanceItems(address).find(
      ({ id, mainNetwork, name, total, transferable, free }) =>
        id === assetId &&
        (isSameString(name, networkName) || isSameString(mainNetwork, networkName)) &&
        (transferable !== undefined || total !== undefined || free !== undefined)
    );

    return cachedBalance?.transferable ?? cachedBalance?.total ?? cachedBalance?.free;
  }

  private getCachedJettonBalances(address: string, networkName: NetworkName): TonJettonBalanceResult[] {
    return this.getCachedBalanceItems(address)
      .filter(({ id, mainNetwork, name, type, total, transferable, free }) => {
        if (!id || (transferable === undefined && total === undefined && free === undefined)) return false;

        const belongsToNetwork = isSameString(name, networkName) || isSameString(mainNetwork, networkName);

        return belongsToNetwork && type === 'jetton';
      })
      .map(({
        assetIcon,
        icon,
        id,
        precision,
        symbol,
        total,
        transferable,
        free,
        walletAddress,
        priceId,
        priceAssetKey,
        assetMetadataTrust,
        assetMetadataSource,
      }) => ({
        balance: transferable ?? total ?? free ?? '0',
        image: assetIcon ?? icon,
        name: symbol,
        precision,
        symbol,
        assetId: id,
        priceId,
        priceAssetKey,
        assetMetadataTrust: assetMetadataTrust ?? 'unverified',
        assetMetadataSource: assetMetadataSource ?? 'indexer',
        walletAddress,
        state: APIItemState.ERROR,
      }));
  }

  private getCachedBalanceItems(address: string): BalanceItem[] {
    const accountAddress = this.state.keyringService.getSubstrateAddress?.(address) ?? address;
    const groups = this.state.balanceService.balanceMap[accountAddress] ?? this.state.balanceService.balanceMap[address] ?? [];

    return groups.flatMap(({ balances }) => balances);
  }

  private getWalletContract(address: string) {
    const stored = this.state.keyringService.tonKeyring.accountSubject.value[address];
    if (stored?.walletContract) return stored.walletContract;
    const account = this.state.keyringService.getAllMainAccounts().find(({ address: accountAddress }) =>
      isSameString(accountAddress, address)
    );
    const publicKeyHex = account?.meta.tonPublicKeyHex as string | undefined;

    if (!publicKeyHex || !/^[0-9a-f]{64}$/iu.test(publicKeyHex)) {
      throw new Error('ton_public_key_unavailable');
    }

    return this.state.keyringService.tonKeyring.createContractV4(
      Uint8Array.from(Buffer.from(publicKeyHex, 'hex'))
    );
  }
}

function withTimeout<T>(request: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('ton_address_lookup_timeout')), timeoutMs);
  });

  return Promise.race([request, timeout]).finally(() => clearTimeout(timer));
}
