/* eslint-disable */
// Test oracle: every 3.0.5 writer of the legacy asset-preference keys, with the Pinia store reduced to a plain
// object and `localStorage` to a string map. Method bodies are verbatim copies from commit
// 600a64d51365a40de646925e4b591ca06ff63643 (the Chrome Web Store 3.0.5 baseline); only `this.lsAccount` is
// pointed at the string map and the imports are dropped:
// - `toggleCurrenciesVisible` (the "Hide zero balances" button): `src/screens/wallet&asset/wallet/Wallet.vue:287-331`
//   (blob sha256 5d86dd2f2bf2fe9e352a5ea1d30d0254e24b778069f2bb75aed9cd96aab0d578);
// - `setBalance`, `setHiddenAssets`: `src/stores/accounts/actions.ts:46-60,78-101`
//   (blob sha256 a9df30582ca3cc88de7175f4172097e207924bee940cb07cc460f26d480199a0);
//   `hiddenAssets` getter: `src/stores/accounts/getters.ts:38-42`;
// - `getHiddenAssets`, `setHiddenAssets`, `getSequenceAssets`, `setSequenceAssets`, `getCustomSort`,
//   `setCustomSort`: `src/controllers/accountController.ts` (blob sha256
//   10c8020712018c039939a5ed2433458610d0b428c2853c1b4c6932d2d2d1ceb1), over the `{ value }` envelope of
//   `src/controllers/localStorageController.ts:16-28`;
// - `setTonBalanceItem305`: the group lookup of `BalanceService.setBalanceItem` and `setJettonBalanceItem`,
//   `src/extension/background/extension-base/src/services/balance-service/index.ts:100-117,140-170`
//   (blob sha256 a0ff107a9abdce0fb8e41d5739e8c2a811f18c0a6f82d561a7bbd1c5ad5233d3), reduced to the grouping.
// Do not edit: the localStorage-305.*.json fixtures are generated from this file by generate.ts.
import type { BalanceItem } from '@extension-base/api/evm/types';
import type { TokenGroup } from '@extension-base/background/types/types';

export type Storage305 = Record<string, string>;

class LocalStorage305 {
  constructor(
    private storage: Storage305,
    private prefix: string
  ) {}

  public get(key: string): Record<string, any> {
    const item = this.storage[`${this.prefix}${key}`];

    return item ? JSON.parse(item) : {};
  }

  public set(key: string, _value: unknown) {
    const value = {
      value: _value,
    };

    this.storage[`${this.prefix}${key}`] = JSON.stringify(value);
  }
}

class AccountController305 {
  private readonly lsAccount: LocalStorage305;
  private readonly sequenceAssetsStorageName = 'sequence-assets';
  private readonly customSort = 'custom-sort';
  private readonly hiddenAssets = 'hidden-assets';

  constructor(storage: Storage305) {
    this.lsAccount = new LocalStorage305(storage, 'account_');
  }

  public getHiddenAssets(): Record<string, string[]> {
    return this.lsAccount.get(this.hiddenAssets).value ?? {};
  }

  public setHiddenAssets(hiddenAssets: Record<string, string[]>): void {
    this.lsAccount.set(this.hiddenAssets, hiddenAssets);
  }

  private getSequenceAssets(): Record<string, string> {
    const sequencesAssets = this.lsAccount.get(this.sequenceAssetsStorageName);

    return sequencesAssets.value ?? {};
  }

  public setSequenceAssets(sequence: string[], address: string): void {
    const prevSequence = this.getSequenceAssets();
    const newSequence = {
      ...prevSequence,
      [address]: sequence.join(),
    };

    this.lsAccount.set(this.sequenceAssetsStorageName, newSequence);
  }

  public getCustomSort(): Record<string, boolean> {
    return this.lsAccount.get(this.customSort).value ?? {};
  }

  public setCustomSort(address: string) {
    this.lsAccount.set(this.customSort, { [address]: true });
  }
}

/** The 3.0.5 accounts store for one selected wallet, persisting into `storage` exactly like 3.0.5. */
export function createAccountsStore305(address: string, balances: TokenGroup[], storage: Storage305) {
  const accountController = new AccountController305(storage);

  return {
    selectedWallet: { address },
    balances,
    hiddenAssetsForAllAccounts: accountController.getHiddenAssets(),
    isCustomSorted: accountController.getCustomSort(),

    get hiddenAssets(): string[] {
      return this.hiddenAssetsForAllAccounts[this.selectedWallet.address] ?? [];
    },

    setBalance({ details, saveSequence = false }: { details: TokenGroup[]; reset?: boolean; saveSequence?: boolean }) {
      if (saveSequence) {
        const address = this.selectedWallet.address;
        const sequence = details.map(({ groupId }) => groupId);

        accountController.setSequenceAssets(sequence, address);

        accountController.setCustomSort(address);

        this.isCustomSorted = {
          ...this.isCustomSorted,
          [address]: true,
        };
      }

      this.balances = details;
    },

    setHiddenAssets({ groupId, value }: { groupId: string; value: boolean }) {
      const address = this.selectedWallet.address;
      const hiddenAssets = this.hiddenAssetsForAllAccounts[address] ?? [];

      if (value) {
        const index = this.hiddenAssetsForAllAccounts[address].findIndex((id) => id === groupId);

        if (index !== -1) {
          hiddenAssets.splice(index, 1);

          this.hiddenAssetsForAllAccounts = {
            ...this.hiddenAssetsForAllAccounts,
            [address]: hiddenAssets,
          };
        }
      } else {
        this.hiddenAssetsForAllAccounts = {
          ...this.hiddenAssetsForAllAccounts,
          [address]: Array.from(new Set([...hiddenAssets, groupId])),
        };
      }

      accountController.setHiddenAssets(this.hiddenAssetsForAllAccounts);
    },
  };
}

export type AccountsStore305 = ReturnType<typeof createAccountsStore305>;

/** The 3.0.5 "Hide zero balances" / "Show all" button of `Wallet.vue`. */
export function toggleCurrenciesVisible305(accountsStore: AccountsStore305, allCurrenciesHidden: boolean) {
  const wallet = {
    accountsStore,

    toggleCurrenciesVisible(allCurrenciesHidden: boolean) {
      if (allCurrenciesHidden) {
        this.accountsStore.balances.forEach(({ groupId }) =>
          this.accountsStore.setHiddenAssets({ groupId, value: true })
        );

        return;
      }

      const nonZeroBalanceCb = ({ transferable }: BalanceItem) => transferable && +transferable > 0;

      this.accountsStore.balances.forEach(({ groupId, balances }) => {
        const index = balances.findIndex(nonZeroBalanceCb);
        const isZeroBalance = index === -1;

        if (isZeroBalance) this.accountsStore.setHiddenAssets({ groupId, value: false });
      });

      const assetsVisibleWithBalance = this.accountsStore.balances.filter(({ balances, groupId }) => {
        const haveAssets = balances.findIndex(nonZeroBalanceCb) !== -1;
        const isVisibleAsset = !this.accountsStore.hiddenAssets.includes(groupId);

        return isVisibleAsset && haveAssets;
      });

      const assetsInvisibleWithBalance = this.accountsStore.balances.filter(({ balances, groupId }) => {
        const haveAssets = balances.findIndex(nonZeroBalanceCb) !== -1;
        const isHiddenAsset = this.accountsStore.hiddenAssets.includes(groupId);

        return isHiddenAsset && haveAssets;
      });

      const assetsInvisibleWithoutBalance = this.accountsStore.balances.filter(({ balances, groupId }) => {
        const notHaveAssets = balances.findIndex(nonZeroBalanceCb) === -1;
        const isHiddenAsset = this.accountsStore.hiddenAssets.includes(groupId);

        return isHiddenAsset && notHaveAssets;
      });

      this.accountsStore.setBalance({
        details: [...assetsVisibleWithBalance, ...assetsInvisibleWithBalance, ...assetsInvisibleWithoutBalance],
        reset: false,
        saveSequence: true,
      });
    },
  };

  wallet.toggleCurrenciesVisible(allCurrenciesHidden);
}

/**
 * 3.0.5 `TonBalance` reported every TON balance with `relayChain: networkName.toLowerCase()` and jettons with
 * `id: "${name} - ${symbol}"` and a lowercased symbol. `setBalanceItem` put it into the first group with that id,
 * or with the same symbol and relay chain, and otherwise appended a jetton group.
 */
export function setTonBalanceItem305(
  groups: TokenGroup[],
  networkKey: string,
  item: Partial<BalanceItem> & { name?: string }
): void {
  const groupIndex = groups.findIndex(({ groupId, symbol, relayChain }) => {
    const isExistingAssetId = groupId === item.id;
    const isExistingDisplayName = symbol === item.symbol;
    const isExistingAsset = isExistingDisplayName && relayChain === item.relayChain;

    return isExistingAssetId || isExistingAsset;
  });

  if (groupIndex === -1) {
    groups.push({
      icon: item.assetIcon!,
      groupId: item.id!,
      mainNetwork: networkKey,
      providers: [],
      symbol: item.symbol!,
      tokenName: item.name!,
      relayChain: item.relayChain as TokenGroup['relayChain'],
      priceId: item.symbol,
      balances: [
        {
          address: '',
          icon: item.icon!,
          name: networkKey,
          precision: item.precision!,
          state: item.state!,
          total: item.total,
          transferable: item.transferable,
          reserved: '0',
          frozen: '0',
          locked: '0',
          mainNetwork: networkKey,
          symbol: item.symbol!,
          type: 'jetton',
          id: item.id!,
        } as BalanceItem,
      ],
    });

    return;
  }

  const assetIndex = groups[groupIndex].balances.findIndex(
    ({ name }) => name.toLowerCase() === networkKey.toLowerCase()
  );

  groups[groupIndex].balances[assetIndex] = {
    ...groups[groupIndex].balances[assetIndex],
    total: item.total,
    transferable: item.transferable,
    state: item.state!,
  };
}
