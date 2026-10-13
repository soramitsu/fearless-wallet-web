import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PricesService } from '@extension-base/services/prices-service';
import type { PriceJson } from '@extension-base/background/types/types';

const io = vi.hoisted(() => ({ acknowledgements: [] as Array<() => void> }));
// Keep the actual PriceStore and SubscribableStore publication path; hold only their storage acknowledgement.
vi.mock('@extension-base/stores/BaseExtension', () => ({ default: class {
  set(_key: string, _value: unknown, update: () => void) { io.acknowledgements.push(update); }
} }));
vi.mock('@extension-base/stores/BaseWeb', () => ({ default: class {
  set(_key: string, _value: unknown, update: () => void) { io.acknowledgements.push(update); }
} }));
vi.mock('@extension-base/stores/Storage', () => ({ storage: { get: async () => ({}), set: async () => {} } }));
vi.mock('@extension-base/services/prices-service/CoinGeckoService', () => ({ CoinGeckoService: class {} }));
vi.mock('@extension-base/services/prices-service/TonPricingService', () => ({ TonPricingService: class {} }));
vi.mock('@extension-base/services/prices-service/SoraPricingService', () => ({ SoraPricingService: class {} }));

const quote = (fiat: string, value: number): PriceJson => ({ fiat, tokenPriceMap: { bitcoin: value }, tokenPriceChange: {} });

describe('price publication ownership', () => {
  beforeEach(() => { io.acknowledgements.length = 0; });

  it('does not publish a prior-currency storage acknowledgement after an explicit selection', () => {
    const service = new PricesService({} as never);
    const subscriber = vi.fn();
    const callback = vi.fn();
    service.getSubject().subscribe(subscriber);
    service.setPriceStore(quote('usd', 60000), callback);
    service.setFiatSymbol('eur');
    io.acknowledgements[0]();
    expect(subscriber).not.toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalled();
    service.setPriceStore(quote('eur', 50000));
    io.acknowledgements[1]();
    expect(subscriber).toHaveBeenCalledOnce();
    expect(subscriber).toHaveBeenCalledWith(quote('eur', 50000));
  });

  it('does not publish an older price snapshot when its acknowledgement arrives after a fresh quote', () => {
    const service = new PricesService({} as never);
    const subscriber = vi.fn();
    service.getSubject().subscribe(subscriber);
    service.setPriceValue(quote('usd', 60000));
    service.setPriceStore(service.prices.json);
    service.setPriceValue(quote('usd', 61000));
    service.setPriceStore(service.prices.json);
    io.acknowledgements[0]();
    expect(subscriber).not.toHaveBeenCalled();
    io.acknowledgements[1]();
    expect(subscriber).toHaveBeenCalledOnce();
    expect(subscriber).toHaveBeenCalledWith(quote('usd', 61000));
  });
});
