import { EXTENSION_PREFIX } from '@extension-base/defaults';
import SubscribableStore from '@extension-base/stores/SubscribableStore';
import type { WalletEcosystem } from '@/interfaces';

export interface CurrentAccountInfo {
  address: string;
  ethereumAddress: string;
  bitcoinAddress?: string;
  bitcoinTestnetAddress?: string;
  solanaAddress?: string;
  irohaAddress?: string;
  irohaPublicKeyHex?: string;
  name: string;
  isMobile: boolean;
  wcTopic?: string;
  walletEcosystem: WalletEcosystem;
}

export type CurrentAccountState = CurrentAccountInfo | null;

export class CurrentAccountContextChanged extends Error {
  constructor() { super('Wallet selection context changed.'); }
}

function selection(value: CurrentAccountState | undefined): CurrentAccountState {
  if (value !== null && value !== undefined &&
    (typeof value !== 'object' || Array.isArray(value) || typeof value.address !== 'string' || !value.address))
    throw new Error('Invalid saved wallet selection.');
  return value ?? null;
}

export default class CurrentAccountStore extends SubscribableStore<CurrentAccountState> {
  // Hold a selection slot across a compensating write. A later user choice may
  // never be overwritten by rollback from an earlier, cancelled operation.
  private static selections: Promise<void> = Promise.resolve();
  private static recovery?: { previous: CurrentAccountState; publish: () => void };

  constructor() {
    super(EXTENSION_PREFIX ? `${EXTENSION_PREFIX}current_account` : null);
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = CurrentAccountStore.selections.then(operation);
    CurrentAccountStore.selections = result.then(() => {}, () => {});
    return result;
  }

  private async recover(): Promise<void> {
    const recovery = CurrentAccountStore.recovery;
    if (!recovery) return;
    await super.updateAndWait('CurrentAccountInfo', () => recovery.previous, undefined, false);
    CurrentAccountStore.recovery = undefined;
    recovery.publish();
  }

  readSelection(): Promise<CurrentAccountState> {
    return this.enqueue(async () => {
      await this.recover();
      return selection(await super.getAndWait('CurrentAccountInfo'));
    });
  }

  settleSelection(): Promise<void> {
    return this.enqueue(() => this.recover());
  }

  select(
    next: CurrentAccountState,
    publish: (value: CurrentAccountState) => void,
    assertCurrent?: () => void,
    uncertain?: () => void,
    recovered?: (previous: CurrentAccountState) => void
  ): Promise<void> {
    const snapshot = structuredClone(selection(next));
    return this.enqueue(async () => {
      await this.recover();
      let previous: CurrentAccountState = null;
      await super.updateAndWait('CurrentAccountInfo', (current) => {
        previous = structuredClone(selection(current));
        assertCurrent?.();
        return snapshot;
      }, undefined, false);
      try {
        assertCurrent?.();
      } catch (error) {
        CurrentAccountStore.recovery = { previous, publish: () => recovered?.(previous) };
        try { await this.recover(); } catch (storageError) {
          // Do not expose a wallet while its durable selection is uncertain.
          uncertain?.();
          throw storageError;
        }
        throw error;
      }
      // This synchronous publication is the commit point for guarded work.
      publish(snapshot);
    });
  }
}
