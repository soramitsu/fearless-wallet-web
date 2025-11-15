import { WalletEcosystem } from '@/interfaces';

type Unsubscribe = () => void;

const buildFetchKey = (ecosystem: WalletEcosystem, network: string, address: string): string =>
  `${ecosystem}:${network.toLowerCase()}:${address.toLowerCase()}`;

const buildSubscriptionKey = (ecosystem: WalletEcosystem, network: string): string =>
  `${ecosystem}:${network.toLowerCase()}`;

type FetchOptions = {
  ecosystem: WalletEcosystem;
  network: string;
  address: string;
  ttl: number;
};

type SubscriptionOptions = {
  ecosystem: WalletEcosystem;
  network: string;
  unsubscribe: Unsubscribe;
};

export class BalanceLookupRegistry {
  private readonly fetchCache = new Map<string, number>();
  private readonly subscriptions = new Map<string, Unsubscribe>();

  shouldThrottleFetch({ ecosystem, network, address, ttl }: FetchOptions): boolean {
    const key = buildFetchKey(ecosystem, network, address);
    const lastFetched = this.fetchCache.get(key);

    if (lastFetched === undefined) return false;

    return Date.now() - lastFetched < ttl;
  }

  markFetch(ecosystem: WalletEcosystem, network: string, address: string): void {
    const key = buildFetchKey(ecosystem, network, address);

    this.fetchCache.set(key, Date.now());
  }

  registerSubscription({ ecosystem, network, unsubscribe }: SubscriptionOptions): void {
    const key = buildSubscriptionKey(ecosystem, network);
    const previous = this.subscriptions.get(key);

    if (previous) {
      try {
        previous();
      } catch (error) {
        console.warn('[BalanceLookupRegistry] Failed to teardown previous subscription', error);
      }
    }

    this.subscriptions.set(key, unsubscribe);
  }

  cancelSubscription(ecosystem: WalletEcosystem, network: string, invoke = true): void {
    const key = buildSubscriptionKey(ecosystem, network);
    const unsubscribe = this.subscriptions.get(key);

    if (unsubscribe && invoke) {
      try {
        unsubscribe();
      } catch (error) {
        console.warn('[BalanceLookupRegistry] Failed to teardown subscription', error);
      }
    }

    this.subscriptions.delete(key);
  }

  clearFetchCache(ecosystem: WalletEcosystem, network?: string, address?: string): void {
    const normalizedNetwork = network?.toLowerCase();
    const normalizedAddress = address?.toLowerCase();

    Array.from(this.fetchCache.keys()).forEach((key) => {
      const [cachedEcosystem, cachedNetwork, cachedAddress] = key.split(':');

      if (cachedEcosystem !== ecosystem) return;
      if (normalizedNetwork && cachedNetwork !== normalizedNetwork) return;
      if (normalizedAddress && cachedAddress !== normalizedAddress) return;

      this.fetchCache.delete(key);
    });
  }
}

export default BalanceLookupRegistry;
