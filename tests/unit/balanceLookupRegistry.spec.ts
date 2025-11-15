import BalanceLookupRegistry from '@/extension/background/extension-base/src/services/balance-service/BalanceLookupRegistry';
import { WalletEcosystem } from '@/interfaces';

describe('BalanceLookupRegistry', () => {
  it('throttles repeated fetches within the TTL window', () => {
    const registry = new BalanceLookupRegistry();
    const args = {
      ecosystem: WalletEcosystem.Substrate,
      network: 'Polkadot',
      address: 'ADDR-1',
      ttl: 10_000,
    };

    expect(registry.shouldThrottleFetch(args)).toBe(false);

    registry.markFetch(args.ecosystem, args.network, args.address);

    expect(registry.shouldThrottleFetch(args)).toBe(true);

    registry.clearFetchCache(args.ecosystem, undefined, args.address);

    expect(registry.shouldThrottleFetch(args)).toBe(false);
  });

  it('tears down previous subscriptions when re-registering', () => {
    const registry = new BalanceLookupRegistry();
    const firstUnsubscribe = jest.fn();
    const secondUnsubscribe = jest.fn();

    registry.registerSubscription({
      ecosystem: WalletEcosystem.Substrate,
      network: 'Polkadot',
      unsubscribe: firstUnsubscribe,
    });

    registry.registerSubscription({
      ecosystem: WalletEcosystem.Substrate,
      network: 'Polkadot',
      unsubscribe: secondUnsubscribe,
    });

    expect(firstUnsubscribe).toHaveBeenCalledTimes(1);
    expect(secondUnsubscribe).not.toHaveBeenCalled();

    registry.cancelSubscription(WalletEcosystem.Substrate, 'Polkadot');

    expect(secondUnsubscribe).toHaveBeenCalledTimes(1);
  });

  it('supports ecosystem-specific fetch caches', () => {
    const registry = new BalanceLookupRegistry();

    registry.markFetch(WalletEcosystem.Evm, 'Ethereum', '0x123');
    registry.markFetch(WalletEcosystem.Ton, 'TON', 'addr-ton');

    registry.clearFetchCache(WalletEcosystem.Evm, undefined, '0x123');

    expect(
      registry.shouldThrottleFetch({
        ecosystem: WalletEcosystem.Evm,
        network: 'Ethereum',
        address: '0x123',
        ttl: 30_000,
      })
    ).toBe(false);

    expect(
      registry.shouldThrottleFetch({
        ecosystem: WalletEcosystem.Ton,
        network: 'TON',
        address: 'addr-ton',
        ttl: 30_000,
      })
    ).toBe(true);
  });
});
