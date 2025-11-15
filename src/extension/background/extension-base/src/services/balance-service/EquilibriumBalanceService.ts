import { APIItemState } from '@extension-base/api/types/networks';
import { getSoraUtilOrThrow } from '@extension-base/services/utils/sora';
import type { SoraUtilModule } from '@extension-base/services/utils/sora';
import type { ApiPromise } from '@polkadot/api';
import type State from '@extension-base/background/handlers/State';
import type { RelayChainName } from '@/interfaces';
import type { u128 } from '@polkadot/types-codec';
import { CHAIN_IDS, EQUILIBRIUM } from '@/consts/networks';
import { isSameString } from '@/helpers';

const getSoraOrThrow = (): SoraUtilModule => getSoraUtilOrThrow();

type EquilibriumAccount = {
  data: {
    asV0: {
      lock: u128;
      balance: Array<[u128, { asPositive: u128 }]>;
    };
  };
};

export default class EquilibriumBalanceService {
  constructor(private readonly state: State) {}

  subscribeBalance(address: string, api: ApiPromise) {
    const { FPNumber } = getSoraOrThrow();
    const {
      parentId,
      assets,
      name: networkName,
    } = this.state.networkService.networksGithub.find(({ name }) => isSameString(name, EQUILIBRIUM))!;

    const relayChain = CHAIN_IDS[parentId!] ?? (networkName as RelayChainName);

    const pallet = api!.rx.query.system.account(address ?? '');

    const sub = pallet.subscribe((balances) => {
      const { asV0 } = (balances as unknown as EquilibriumAccount).data;
      const locked = FPNumber.fromCodecValue(asV0.lock.toNumber(), 9); // TODO: 9 дефолтный precision, уточнить насчет asV0.lock
      const balanceEntries = asV0.balance;

      const notZeroBalances = balanceEntries.map(([key, { asPositive }]) => {
        const _currencyId = (key as u128).toString();
        const balanceValue = (asPositive as u128).toNumber();

        const { symbol, id, precision } = assets.find(({ currencyId }) => currencyId === _currencyId)!;

        const transferable = FPNumber.fromCodecValue(balanceValue, precision);

        this.state.balanceService.setBalanceItem(
          'Equilibrium',
          {
            state: APIItemState.READY,
            relayChain,
            symbol,
            id,
            reserved: '0',
            frozen: '0',
            total: locked.add(transferable).toString(),
            locked: locked.toString(),
            transferable: transferable.toString(),
          },
          address
        );

        return id;
      });

      // У Equilibrium system.account это "особенный" паллет, балансы возвращаются разом для всех токенов
      // Причем возвращаются только не нулевые балансы
      // Поэтому нужно пройтись по остальным(нулевым) балансам и проставить для них статуc Ready, тк по факту мы их "получили" и знаем, что они = 0
      const substrateAddress = this.state.keyringService.getSubstrateAddress(address);

      assets.forEach(({ id, symbol }) => {
        if (!notZeroBalances.includes(id))
          this.state.balanceService.setBalanceItem(
            'Equilibrium',
            {
              state: APIItemState.READY,
              relayChain,
              symbol,
              id,
              reserved: '0',
              frozen: '0',
              total: '0',
              locked: '0',
              transferable: '0',
            },
            substrateAddress
          );
      });
    });

    return () => sub.unsubscribe();
  }

  fetchBalance(address: string, api: ApiPromise) {
    const { FPNumber } = getSoraOrThrow();
    const {
      parentId,
      assets,
      name: networkName,
    } = this.state.networkService.networksGithub.find(({ name }) => isSameString(name, EQUILIBRIUM))!;

    const relayChain = CHAIN_IDS[parentId!] ?? (networkName as RelayChainName);

    return api.query.system.account(address).then((balances) => {
      const { asV0 } = (balances as unknown as EquilibriumAccount).data;
      const locked = FPNumber.fromCodecValue(asV0.lock.toString(), 9);
      const balanceEntries = asV0.balance;

      const processedAssetIds: string[] = [];
      const responses: { network: string; assetId: string; balance: string }[] = [];

      balanceEntries.forEach(([key, { asPositive }]) => {
        const currencyId = (key as u128).toString();
        const balanceValue = (asPositive as u128).toString();
        const assetMeta = assets.find(({ currencyId: id }) => id === currencyId);

        if (!assetMeta) return;

        const transferable = FPNumber.fromCodecValue(balanceValue, assetMeta.precision);

        processedAssetIds.push(assetMeta.id);

        this.state.balanceService.setBalanceItem(
          networkName,
          {
            state: APIItemState.READY,
            relayChain,
            symbol: assetMeta.symbol,
            id: assetMeta.id,
            reserved: '0',
            frozen: '0',
            total: locked.add(transferable).toString(),
            locked: locked.toString(),
            transferable: transferable.toString(),
          },
          address
        );

        responses.push({
          network: networkName,
          assetId: assetMeta.id,
          balance: transferable.toString(),
        });
      });

      const substrateAddress = this.state.keyringService.getSubstrateAddress(address);

      assets.forEach(({ id, symbol }) => {
        if (processedAssetIds.includes(id)) return;

        responses.push({
          network: networkName,
          assetId: id,
          balance: '0',
        });

        this.state.balanceService.setBalanceItem(
          networkName,
          {
            state: APIItemState.READY,
            relayChain,
            symbol,
            id,
            reserved: '0',
            frozen: '0',
            total: '0',
            locked: '0',
            transferable: '0',
          },
          substrateAddress
        );
      });

      return responses;
    });
  }
}
