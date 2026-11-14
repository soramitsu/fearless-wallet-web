import { logger as createLogger } from '@polkadot/util';
import { BALANCE_PUBLISH_DELAY_MS, BALANCE_PUBLISH_MAX_WAIT_MS } from '@extension-base/services/balance-service/publishTiming';
import { DOTSAMA_API_TIMEOUT } from '@extension-base/const/intervals';
import { subscriptionIdentity } from '@extension-base/utils/subscriptionIdentity';
import type { Subscription } from 'rxjs';
import type State from '@extension-base/background/handlers/State';
import type { Logger } from '@polkadot/util/types';
import type {
  MessageTypesWithSubscriptions,
  Port,
  SubscriptionMessageTypes,
} from '@extension-base/background/types/types';
import type { FWKeyringMeta, NetworkJson } from '@extension-base/types';
import type { NetworkName } from '@/interfaces';
import { WalletEcosystem } from '@/interfaces';
import { isSameString } from '@/helpers';
import { walletEcosystemOf } from '@/extension/background/extension-base/src/background/helpers/walletEcosystem';
import { IS_EXTENSION_SMOKE } from '@/consts/global';
import { withDeadline } from '@/bootstrap/boundedAttempts';

type UpdateSub = {
  name: NetworkName;
  func: () => void;
};

type SubscriptionMap = {
  [key in string]: (() => void) | undefined;
};

interface ServiceInfo {
  address: string;
  ethereumAddress: string;
  networks: {
    substrate: NetworkName[];
    evm: NetworkName[];
    ton: NetworkName[];
    solana: NetworkName[];
    bitcoin: NetworkName[];
    iroha: NetworkName[];
  };
}

export interface GetBalancesProps {
  address: string;
  ethereumAddress: string;
  bitcoinAddress?: string;
  bitcoinTestnetAddress?: string;
  solanaAddress?: string;
  irohaAddress?: string;
  walletEcosystem?: WalletEcosystem;
  substrateNetworks?: NetworkName[];
  evmNetworks?: NetworkName[];
  tonNetworks?: NetworkName[];
  solanaNetworks?: NetworkName[];
  bitcoinNetworks?: NetworkName[];
  irohaNetworks?: NetworkName[];
  isFirstRun?: boolean;
  /** Read only these ecosystems of the wallet. */
  only?: ReadonlySet<WalletEcosystem>;
  /** Read again even what was read moments ago. */
  force?: boolean;
}

/**
 * Changes to the wallet or its networks are gathered for this long before balances are read for them. The first one
 * after the wallet starts, or wakes, waits only FIRST_SERVICE_INFO_DELAY_MS: nothing was read before it.
 */
export const SERVICE_INFO_DELAY_MS = 1000;
export const FIRST_SERVICE_INFO_DELAY_MS = 20;
/**
 * The wallet on screen is read first. The other wallets, which feed the wallet list and All wallets from their saved
 * balances meanwhile, start this much later, so they do not compete with it for the same nodes.
 */
export const OTHER_WALLETS_START_DELAY_MS = 3000;

/**
 * How often the balances no subscription keeps current are read again while a wallet page is open. Substrate
 * balances are live: every change arrives through its subscription.
 */
export const BALANCE_POLL_MS: Readonly<Record<string, number>> = Object.freeze({
  [WalletEcosystem.Evm]: 60_000,
  [WalletEcosystem.Ton]: 60_000,
  [WalletEcosystem.Solana]: 60_000,
  // A read walks the wallet's addresses (Bitcoin) or pages the chain's assets (Iroha) on public indexers.
  [WalletEcosystem.Bitcoin]: 180_000,
  [WalletEcosystem.Iroha]: 180_000,
});
const POLLED_ECOSYSTEMS = [
  WalletEcosystem.Evm,
  WalletEcosystem.Ton,
  WalletEcosystem.Solana,
  WalletEcosystem.Bitcoin,
  WalletEcosystem.Iroha,
] as const;
/** A wallet page that opens has what was read longer ago than this read again. */
export const PAGE_OPEN_REFRESH_AGE_MS = 20_000;

const emptyServiceInfo = (): ServiceInfo => ({
  address: '',
  ethereumAddress: '',
  networks: { evm: [], substrate: [], ton: [], solana: [], bitcoin: [], iroha: [] },
});

export class SubscriptionService {
  private logger: Logger;
  private subscriptionsPorts = new Map<string, Port | 'sw-messages'>();
  private serviceInfoSubscription: Subscription | undefined;
  subscriptionNetworksMap: SubscriptionMap = {}; // subscriptions for networks balances
  private unsubscriptionMap = new Map<string, () => void>();
  private subscriptionTokens = new Map<string, symbol>();
  private networkSubscriptionTokens = new Map<string, symbol>();
  // Counts stop() calls: reads started before the wallet went quiet do not subscribe afterwards.
  private generation = 0;
  private otherWalletsTimer?: ReturnType<typeof setTimeout>;
  // When each ecosystem of the selected wallet was last read, and the reads still running.
  private polledAt = new Map<WalletEcosystem, number>();
  private polls = new Map<WalletEcosystem, Promise<unknown>>();

  private serviceInfo: ServiceInfo = emptyServiceInfo();

  constructor(private state: State) {
    this.logger = createLogger('Subscription');

    // The display projection lists the wallet's accounts, so it runs once the wallet records have been read. Run
    // earlier, it found no accounts whenever the authorization store answered first.
    void Promise.resolve(this.state.eventService?.waitCryptoReady)
      .then(() => this.init())
      .catch(() => this.logger.error('Unable to persist authorization account display state'));
  }

  // Clear a previous subscriber
  private unsubscribe(id: string): void {
    this.subscriptionsPorts.delete(id);
    this.subscriptionTokens.delete(id);
  }

  createSubscription<TMessageType extends MessageTypesWithSubscriptions>(
    id: string,
    port?: Port
  ): (data: SubscriptionMessageTypes[TMessageType] | null) => void {
    const key = subscriptionIdentity(id, port);
    if (this.subscriptionsPorts.has(key)) this.cancelSubscription(id, port);
    const token = Symbol(id);
    this.subscriptionTokens.set(key, token);
    this.subscriptionsPorts.set(key, port ?? 'sw-messages');

    // 'subscription' is a callback
    return (subscription: unknown): void => {
      if (this.subscriptionTokens.get(key) === token) {
        try {
          if (port) port.postMessage({ id, subscription });
          else {
            const channel = new BroadcastChannel('sw-messages');
            try { channel.postMessage({ id, subscription }); }
            finally { channel.close(); }
          }
        } catch (error) {
          console.info('Error occurred while trying to post message', error);

          this.cancelSubscription(id, port);
        }
      }
    };
  }

  setUnsubscriptionHandle(id: string, unsubscribe: () => void, port?: Port): void {
    const key = subscriptionIdentity(id, port);
    // BehaviorSubject may deliver (and close the port) before subscribe() returns its handle.
    if (!this.subscriptionsPorts.has(key)) {
      unsubscribe();
      return;
    }
    this.unsubscriptionMap.set(key, unsubscribe);
  }

  cancelSubscription(id: string, port?: Port): boolean {
    const key = subscriptionIdentity(id, port);
    // Clear subscribe port
    this.unsubscribe(key);

    const cleanup = this.unsubscriptionMap.get(key);
    this.unsubscriptionMap.delete(key);
    cleanup?.();

    return true;
  }

  updateNetworkSubscription(params: UpdateSub) {
    const { name, func } = params;
    const key = name.toLowerCase();
    const oldSub = this.subscriptionNetworksMap[key];
    this.subscriptionNetworksMap[key] = func;
    oldSub?.();
  }

  cancelNetworkSubscription(networkName: string) {
    const key = networkName.toLowerCase();
    const unsub = this.subscriptionNetworksMap[key];
    this.networkSubscriptionTokens.delete(key);
    delete this.subscriptionNetworksMap[key];
    unsub?.();
  }

  /**
   * Ends every balance subscription and forgets the wallet and networks it followed, as the wallet goes quiet. The next
   * start() reads every balance again.
   */
  stop(): void {
    this.logger.log('Stopping subscription');

    this.generation += 1;
    clearTimeout(this.otherWalletsTimer);
    this.otherWalletsTimer = undefined;
    this.polledAt.clear();
    this.polls.clear();
    this.serviceInfoSubscription?.unsubscribe();
    this.serviceInfoSubscription = undefined;
    this.state.timeoutService.clearTimeout('updateServiceInfo');
    new Set([...this.networkSubscriptionTokens.keys(), ...Object.keys(this.subscriptionNetworksMap)])
      .forEach((name) => this.cancelNetworkSubscription(name));
    this.serviceInfo = emptyServiceInfo();
  }

  async start() {
    this.logger.log('Starting subscription');

    const generation = this.generation;

    const accountsExceptCurrent = this.state.keyringService
      .getAllMainAccounts()
      .filter(({ address }) => !isSameString(address, this.state.currentAccount?.address));
    const networks = this.state.networkService.activeNetworkByEcosystem;

    const readOtherWallets = () => accountsExceptCurrent.forEach(({ address, meta }) =>
      this.fetchNetworkBalances({
        address,
        bitcoinAddress: meta.bitcoinAddress as string | undefined,
        bitcoinTestnetAddress: meta.bitcoinTestnetAddress as string | undefined,
        ethereumAddress: meta.ethereumAddress ?? '',
        irohaAddress: meta.irohaAddress as string | undefined,
        solanaAddress: meta.solanaAddress as string | undefined,
        walletEcosystem: meta.walletEcosystem!,
        // Read below, once the connections are ready.
        substrateNetworks: [],
        evmNetworks: networks.evmList,
        tonNetworks: networks.tonList,
        solanaNetworks: networks.solanaList,
        bitcoinNetworks: networks.bitcoinList,
        irohaNetworks: networks.irohaList,
        isFirstRun: true,
      })
    );

    clearTimeout(this.otherWalletsTimer);
    // With no wallet selected nothing is read ahead of them.
    if (!this.state.currentAccount?.address) readOtherWallets();
    else if (accountsExceptCurrent.length) this.otherWalletsTimer = setTimeout(() => {
      this.otherWalletsTimer = undefined;
      if (generation === this.generation) readOtherWallets();
    }, OTHER_WALLETS_START_DELAY_MS);

    // The other wallets' Substrate balances are read once the connections are ready. One that is not ready in time is
    // marked as not refreshed for the wallets that hold it, so their cached amounts are not shown as current.
    if (accountsExceptCurrent.length) void this.readySubstrateNetworks(networks.substrate).then(({ ready, unavailable }) => {
      // Gone quiet meanwhile: the connections were closed, and the next start reads these balances.
      if (generation !== this.generation) return;
      accountsExceptCurrent.forEach(({ address, meta }) => {
        if (ready.length) this.fetchSubstrateBalances(address, meta, ready);
        unavailable.forEach((network) => this.markNotRefreshed(address, network));
      });
    });

    if (!this.serviceInfoSubscription)
      this.serviceInfoSubscription = this.state.serviceInfoSubject.subscribe({
        next: (serviceInfo) => {
          console.info('serviceInfo', serviceInfo);

          this.state.timeoutService.lazyNext(
            'updateServiceInfo',
            () => {
              this.state.cronService.updateCron(serviceInfo);
              this.state.nftService.publishNfts();

              if (!serviceInfo.currentAccountInfo) {
                new Set([...this.networkSubscriptionTokens.keys(), ...Object.keys(this.subscriptionNetworksMap)])
                  .forEach((name) => this.cancelNetworkSubscription(name));
                this.serviceInfo.address = '';
                this.serviceInfo.ethereumAddress = '';
                return;
              }

              const { address, ethereumAddress } = serviceInfo.currentAccountInfo;
              const {
                address: oldAddress,
                ethereumAddress: oldEthereumAddress,
                networks: oldNetworks,
              } = this.serviceInfo;

              const isNewAddress = oldAddress !== address;
              const isNewEthereumAddress = oldEthereumAddress !== ethereumAddress;

              const currentSubstrateNetworks = Object.keys(serviceInfo.apiMap.substrate);
              const currentEvmNetworks = Object.keys(serviceInfo.apiMap.evm);
              const currentTonNetworks = Object.keys(serviceInfo.apiMap.ton);
              const currentSolanaNetworks = this.state.networkService.activeNetworkByEcosystem.solanaList;
              const currentBitcoinNetworks = this.state.networkService.activeNetworkByEcosystem.bitcoinList;
              const currentIrohaNetworks = this.state.networkService.activeNetworkByEcosystem.irohaList;

              this.serviceInfo = {
                address,
                ethereumAddress,
                networks: {
                  substrate: currentSubstrateNetworks,
                  evm: currentEvmNetworks,
                  ton: currentTonNetworks,
                  solana: currentSolanaNetworks,
                  bitcoin: currentBitcoinNetworks,
                  iroha: currentIrohaNetworks,
                },
              };

              // Compare with the previous network set before discarding removed subscriptions.
              new Set([...oldNetworks.substrate, ...this.networkSubscriptionTokens.keys(), ...Object.keys(this.subscriptionNetworksMap)]).forEach((name) => {
                if (isNewAddress || isNewEthereumAddress || !currentSubstrateNetworks.some((current) => isSameString(current, name)))
                  this.cancelNetworkSubscription(name);
              });

              if (isNewAddress || isNewEthereumAddress) {
                this.fetchNetworkBalances({
                  ...serviceInfo.currentAccountInfo,
                  substrateNetworks: this.state.networkService.activeNetworkByEcosystem.substrateList,
                  evmNetworks: this.state.networkService.activeNetworkByEcosystem.evmList,
                  tonNetworks: this.state.networkService.activeNetworkByEcosystem.tonList,
                  solanaNetworks: this.state.networkService.activeNetworkByEcosystem.solanaList,
                  bitcoinNetworks: this.state.networkService.activeNetworkByEcosystem.bitcoinList,
                  irohaNetworks: this.state.networkService.activeNetworkByEcosystem.irohaList,
                });
                // Everything was just read: the polls start from now.
                this.polls.clear();
                const now = Date.now();
                POLLED_ECOSYSTEMS.forEach((ecosystem) => this.polledAt.set(ecosystem, now));

                return;
              }

              const newSubstrateNetworks = currentSubstrateNetworks.filter(
                (network) => !oldNetworks.substrate.includes(network)
              );
              const newEvmNetworks = currentEvmNetworks.filter((network) => !oldNetworks.evm.includes(network));
              const newTonNetworks = currentTonNetworks.filter((network) => !oldNetworks.ton.includes(network));
              const newSolanaNetworks = currentSolanaNetworks.filter((network) => !oldNetworks.solana.includes(network));
              const newBitcoinNetworks = currentBitcoinNetworks.filter(
                (network) => !oldNetworks.bitcoin.includes(network)
              );
              const newIrohaNetworks = currentIrohaNetworks.filter((network) => !oldNetworks.iroha.includes(network));

              // если адрес не менялся, подписываемся только на новые сети(которые только что включили)
              this.fetchNetworkBalances({
                ...serviceInfo.currentAccountInfo,
                evmNetworks: newEvmNetworks,
                substrateNetworks: newSubstrateNetworks,
                tonNetworks: newTonNetworks,
                solanaNetworks: newSolanaNetworks,
                bitcoinNetworks: newBitcoinNetworks,
                irohaNetworks: newIrohaNetworks,
              });

            },
            this.serviceInfo.address ? SERVICE_INFO_DELAY_MS : FIRST_SERVICE_INFO_DELAY_MS
          );
        },
      });
  }

  // Before its metadata loads a connection's `api.query` is empty (@polkadot/api), so a read then proves nothing.
  private async readySubstrateNetworks(networks: NetworkJson[]): Promise<{ ready: NetworkName[]; unavailable: string[] }> {
    const deadline = Date.now() + DOTSAMA_API_TIMEOUT;
    const generation = this.generation;
    const isReady = async (key: string): Promise<boolean> => {
      while (Date.now() < deadline && generation === this.generation) {
        // A failed connection is replaced by the next node; SORA installs its API once connected.
        const api = this.state.getSubstrateApiMap[key]?.api;
        try {
          if (api) return await withDeadline(api.isReadyOrError, deadline - Date.now(), 'Substrate connection not ready').then(() => true);
        } catch { /* Wait for a replacement until the deadline. */ }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      return false;
    };
    const results = await Promise.all(networks.map(async ({ name }) => ({ name, ready: await isReady(name.toLowerCase()) })));

    return {
      ready: results.filter(({ ready }) => ready).map(({ name }) => name.toLowerCase()),
      unavailable: results.filter(({ ready }) => !ready).map(({ name }) => name),
    };
  }

  // The Substrate part of balanceService.fetchBalance, with its choice of address. A second full refresh would read
  // Solana, Bitcoin and Iroha again: an empty network list makes those services read the active or default network.
  private fetchSubstrateBalances(address: string, meta: FWKeyringMeta, networks: NetworkName[]) {
    const publicAccounts = meta.universalWallet?.publicAccounts ?? [];
    const ecosystems = new Set(publicAccounts.map(({ ecosystem }) => ecosystem));
    const ethereumAddress = meta.ethereumAddress ?? '';
    const read = (substrateAddress: string) => this.state.balanceService.substrateBalanceService
      .fetchBalance({ address: substrateAddress, networks, ethereumAddress })
      .catch(() => this.logger.error('Unable to refresh Substrate balances'));

    if (ecosystems.size > 1) {
      if (ecosystems.has(WalletEcosystem.Substrate))
        void read(publicAccounts.find(({ ecosystem }) => ecosystem === WalletEcosystem.Substrate)?.address ?? address);
      return;
    }

    const walletEcosystem = walletEcosystemOf(address, meta.walletEcosystem);
    const otherEcosystems = [WalletEcosystem.Ton, WalletEcosystem.Solana, WalletEcosystem.Bitcoin, WalletEcosystem.Iroha];
    if (!otherEcosystems.includes(walletEcosystem)) void read(address);
  }

  // The scan state the portfolio reads: stale, with the last successful read kept.
  private markNotRefreshed(address: string, network: string) {
    const holds = this.state.balanceService.balanceMap[address]?.some(({ balances }) =>
      balances.some(({ name }) => isSameString(name, network)));
    if (!holds) return;
    void this.state.balanceService.refreshNetworkBalances(network, address, async () => {
      throw new Error('Substrate connection not ready');
    }, true).catch(() => undefined);
  }

  async init(): Promise<void> {
    await this.state.requestService.mutateAuthorizations((authUrls) => {
      for (const auth of Object.values(authUrls)) {
        auth.allowedAccountsMap = auth.isAllowed ? this.state.getAddressList(true) : this.state.getAddressList();
      }
    });
  }

  async fetchNetworkBalances(props: GetBalancesProps) {
    if (IS_EXTENSION_SMOKE) return;

    const { address, walletEcosystem, isFirstRun } = props;

    if (isFirstRun) {
      this.state.balanceService.generateDefaultBalance(address, walletEcosystem!);

      this.state.balanceService.fetchBalance(props);

      return;
    }

    this.state.balanceService.fetchBalance({
      ...props,
      substrateNetworks: [], // Удаялем сабстрейт сети потому что подписываемся на балансы через WS
    });

    // The selected-wallet record written by 1.x-2.7.x has no walletEcosystem. A standalone Ethereum key has accounts
    // on the Substrate-based networks that use Ethereum addresses; the subscription leaves out every other one.
    const selectedEcosystem = walletEcosystemOf(address, walletEcosystem);

    if (selectedEcosystem === WalletEcosystem.Substrate || selectedEcosystem === WalletEcosystem.Evm)
      this.subscribeSubstrateBalances(props);

    // Its balances may have been read moments ago, so nothing would answer a page that just switched to it.
    if (selectedEcosystem === WalletEcosystem.Evm)
      this.state.timeoutService.lazyNext('setBalanceItem', () => this.state.balanceService.publishBalance(), BALANCE_PUBLISH_DELAY_MS, BALANCE_PUBLISH_MAX_WAIT_MS);
  }

  /**
   * Reads the selected wallet's balances again on the networks the wallets follow: an ecosystem read longer ago than
   * `maxAgeMs` (its poll interval by default), or every one with `force` (Refresh). An ecosystem still being read is
   * not read twice; Refresh waits for that read. Refresh also subscribes the Substrate balances again, which reads
   * them at once and retries a network whose subscription never started. Resolves once the reads have answered.
   */
  async refreshCurrentWallet({ force = false, maxAgeMs }: { force?: boolean; maxAgeMs?: number } = {}): Promise<boolean> {
    const account = this.state.currentAccount;

    // Until the first read of the selected wallet has started (start()), there is nothing to read again.
    if (IS_EXTENSION_SMOKE || !account?.address || !isSameString(this.serviceInfo.address, account.address)) return false;

    const networks = this.state.networkService.activeNetworkByEcosystem;
    const now = Date.now();
    const reads: Promise<unknown>[] = [];

    for (const ecosystem of POLLED_ECOSYSTEMS) {
      const running = this.polls.get(ecosystem);

      if (running) {
        if (force) reads.push(running);
        continue;
      }
      if (!force && now - (this.polledAt.get(ecosystem) ?? 0) < (maxAgeMs ?? BALANCE_POLL_MS[ecosystem])) continue;

      this.polledAt.set(ecosystem, now);
      const read = this.state.balanceService
        .fetchBalance({
          ...account,
          substrateNetworks: [],
          evmNetworks: networks.evmList,
          tonNetworks: networks.tonList,
          solanaNetworks: networks.solanaList,
          bitcoinNetworks: networks.bitcoinList,
          irohaNetworks: networks.irohaList,
          only: new Set([ecosystem]),
          force,
        })
        .catch(() => this.logger.error(`Unable to refresh ${ecosystem} balances`))
        .finally(() => {
          if (this.polls.get(ecosystem) === read) this.polls.delete(ecosystem);
        });

      this.polls.set(ecosystem, read);
      reads.push(read);
    }

    const selectedEcosystem = walletEcosystemOf(account.address, account.walletEcosystem);

    if (force && (selectedEcosystem === WalletEcosystem.Substrate || selectedEcosystem === WalletEcosystem.Evm)) {
      void this.subscribeSubstrateBalances({ ...account, substrateNetworks: networks.substrateList });
    }

    await Promise.all(reads);

    return true;
  }

  async subscribeSubstrateBalances(props: GetBalancesProps) {
    const matchesAccount = () => this.state.currentAccount?.address === props.address &&
      (this.state.currentAccount?.ethereumAddress ?? '') === props.ethereumAddress;
    if (!matchesAccount()) return;
    const tokens = new Map<string, symbol>();
    for (const network of props.substrateNetworks ?? []) {
      const key = network.toLowerCase();
      this.cancelNetworkSubscription(key);
      const token = Symbol(key);
      tokens.set(key, token);
      this.networkSubscriptionTokens.set(key, token);
    }
    const isCurrent = (network: string) => {
      const key = network.toLowerCase();
      return tokens.has(key) && tokens.get(key) === this.networkSubscriptionTokens.get(key) &&
        matchesAccount();
    };
    const unsubList = this.state.balanceService.substrateBalanceService.subscribeSubstrateBalances(props, this.state, isCurrent);
    await Promise.all(unsubList.map(async (item) => {
      try {
        const value = await item;
        if (!isCurrent(value.networkName)) value.unsub();
        else this.updateNetworkSubscription({ name: value.networkName, func: value.unsub });
      } catch {
        this.logger.error('Unable to start balance subscription');
      }
    }));
  }
}
