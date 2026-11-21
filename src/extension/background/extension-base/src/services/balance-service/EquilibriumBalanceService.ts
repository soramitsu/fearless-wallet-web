import { APIItemState } from '@extension-base/api/types/networks';
import type { ApiPromise } from '@polkadot/api';
import type State from '@extension-base/background/handlers/State';
import type { RelayChainName } from '@/interfaces';
import type { u128 } from '@polkadot/types-codec';
import { FPNumber } from '@/sora/number';
import { CHAIN_IDS, EQUILIBRIUM } from '@/consts/networks';
import { isSameString } from '@/helpers';

type EquilibriumBalanceEntry = [u128, { asPositive: u128 }];
// Equilibrium eq-primitives defines DECIMALS = 9 for account balances, including locks.
// https://github.com/eq-lab/equilibrium/blob/master/eq-primitives/src/lib.rs
const EQUILIBRIUM_BALANCE_PRECISION = 9;
type EquilibriumAccountData = {
  data: {
    asV0: {
      lock: u128;
      balance: EquilibriumBalanceEntry[];
    };
  };
};

export default class EquilibriumBalanceService {
  constructor(private readonly state: State) {}

  subscribeBalance(address: string, api: ApiPromise) {
    const network = Object.values(this.state.networkService.networkMap).find(({ name }) => isSameString(name, EQUILIBRIUM));
    if (!network) return () => {};
    const {
      parentId,
      assets,
      name: networkName,
    } = network;

    const relayChain = CHAIN_IDS[parentId!] ?? (networkName as RelayChainName);

    const pallet = api!.rx.query.system.account(address ?? '');

    const sub = pallet.subscribe((balances: unknown) => {
      const asV0 = (balances as EquilibriumAccountData).data.asV0;
      const locked = FPNumber.fromCodecValue(asV0.lock.toString(), EQUILIBRIUM_BALANCE_PRECISION);
      const balance = asV0.balance;

      const notZeroBalances = balance.map(([key, { asPositive }]) => {
        const _currencyId = (key as u128).toString();
        const balanceValue = asPositive.toString();

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

}
