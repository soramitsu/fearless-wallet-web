import { APIItemState } from '@extension-base/api/types/networks';
import { FPNumber } from '@sora-substrate/util';
import { reconcileSuccessfulDynamicScan } from '@extension-base/services/balance-service/reconcileSuccessfulScan';
import { DEFAULT_PRICES } from '../prices-service';
import { type ResponseBalanceRequest } from '../../background/types/types';
import type { BalanceItem } from '@extension-base/api/evm/types';
import type { NetworkName } from '@/interfaces';
import type State from '@extension-base/background/handlers/State';
import { isSameString } from '@/helpers';
import { createAssetKey } from '@/portfolio/assetIdentity';

type TonBalanceResult = {
  balance: string;
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
  successful: boolean;
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
          scanCoverage: 'complete',
          total: tonBalance.balance,
          transferable: tonBalance.balance,
        },
        address
      );

      const jettonScan = await this.fetchJettonsAsset(address, networkKey);
      const jettonsBalance = jettonScan.balances;

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
            scanCoverage: 'complete',
            total: balance,
            transferable: balance,
            walletAddress,
          },
          address
        );
      });

      if (jettonScan.successful) {
        reconcileSuccessfulDynamicScan(this.state, {
          address,
          network: networkName,
          observedAssetIds: jettonsBalance.map(({ assetId }) => assetId),
          includes: ({ type }) => type === 'jetton',
        });
      }

      return [
        {
          balance: tonBalance.balance,
          network: networkName,
          assetId: tonId,
        },
        ...jettonsBalance.map(({ balance, assetId }) => ({
          balance,
          network: networkName,
          assetId,
        })),
      ];
    });

    return (await Promise.all(promises)).flat();
  }

  async fetchUtilityAsset(
    address: string,
    networkName: NetworkName,
    precision: number,
    assetId: string
  ): Promise<TonBalanceResult> {
    try {
      const api = this.state.getTonApiMap[networkName];
      const walletContract = this.getWalletContract(address);

      const account = await api.api?.accounts.getAccount(walletContract.address);

      const { balance } = account;

      const balanceFP = FPNumber.fromCodecValue(balance, precision);

      console.info(`[TON] TON ${address}: `, balanceFP.toString());

      return { balance: balanceFP.toString(), state: APIItemState.READY };
    } catch (error) {
      console.error('[TON][fetchUtilityAsset] Error', error);

      return {
        balance: this.getCachedBalance(address, networkName, assetId) ?? '0',
        state: APIItemState.ERROR,
      };
    }
  }

  async fetchJettonsAsset(address: string, networkName: NetworkName): Promise<TonJettonScanResult> {
    try {
      const api = this.state.getTonApiMap[networkName];
      const network = this.state.networkService.networksGithub.find(({ name }) =>
        isSameString(name, networkName)
      );

      const walletContract = this.getWalletContract(address);

      const response = await api.api?.accounts.getAccountJettonsBalances(walletContract.address, {
        currencies: [this.state.pricesService.fiatSymbol],
      });

      const { balances } = response;

      const prices = DEFAULT_PRICES;

      const prepareBalances = balances.map<TonJettonBalanceResult>((props) => {
        const {
          balance,
          jetton: { address: masterAddressValue, decimals, image, symbol, name, verification },
          walletAddress: { address: walletAddress },
        } = props;

        const symbolLower = symbol.toLowerCase();
        const masterAddress = masterAddressValue.toString();
        const isVerified = String(verification).toLowerCase() === 'whitelist';

        if (isVerified && props.price) {
          const { price, diff24 } = this.state.pricesService.tonPricingService.tonParseRates(props.price);
          prices.tokenPriceChange = { ...prices.tokenPriceChange, [masterAddress]: diff24 };
          prices.tokenPriceMap = { ...prices.tokenPriceMap, [masterAddress]: price };
        }

        const balanceFP = FPNumber.fromCodecValue(balance, decimals);

        return {
          balance: balanceFP.toString(),
          precision: decimals,
          symbol: symbolLower,
          walletAddress,
          image,
          name,
          assetId: masterAddress,
          priceId: isVerified ? masterAddress : undefined,
          priceAssetKey: isVerified && network
            ? createAssetKey({
                ecosystem: String(network.ecosystem),
                chainId: String(network.chainId || network.name),
                assetId: masterAddress,
              })
            : undefined,
          assetMetadataTrust: isVerified ? 'verified' : 'unverified',
          assetMetadataSource: 'indexer',
          state: APIItemState.READY,
        };
      });

      this.state.pricesService.setPriceValue(prices);

      return { balances: prepareBalances, successful: true };
    } catch (error) {
      console.error('[TON][fetchJettonsAsset] Error', error);

      return { balances: this.getCachedJettonBalances(address, networkName), successful: false };
    }
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
