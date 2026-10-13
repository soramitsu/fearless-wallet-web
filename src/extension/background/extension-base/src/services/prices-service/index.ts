import PriceStore from '@extension-base/stores/Price';
import { storage } from '@extension-base/stores/Storage';
import axios from 'axios';
import { SoraPricingService } from './SoraPricingService';
import { TonPricingService } from './TonPricingService';
import { CoinGeckoService } from './CoinGeckoService';
import type { BasePriceJson, PriceJson } from '@extension-base/background/types/types';
import type State from '@extension-base/background/handlers/State';
import { URLS } from '@/consts/urls';
import { type FiatJson } from '@/interfaces';
import { withDeadline } from '@/bootstrap/boundedAttempts';

export type Prices = {
  json: PriceJson;
  timestamp: number;
};

export const DEFAULT_PRICES: BasePriceJson = {
  tokenPriceMap: {},
  tokenPriceChange: {},
};

export class PricesService {
  private readonly priceStore: PriceStore;
  private fiats: FiatJson[] = [];
  private priceStoreReady = false;
  private priceRevision = 0;
  private requestRevision = 0;
  public fiatSymbol = 'usd';
  public soraPricingService: SoraPricingService;
  public tonPricingService: TonPricingService;
  public coinGeckoService: CoinGeckoService;

  public prices: Prices = {
    json: {
      ...DEFAULT_PRICES,
      fiat: 'usd',
    },
    timestamp: 0,
  };

  constructor(state: State) {
    this.soraPricingService = new SoraPricingService(state);
    this.tonPricingService = new TonPricingService(state);
    this.coinGeckoService = new CoinGeckoService(state);

    this.priceStore = new PriceStore();

    storage.get(['fiatSymbol']).then(({ fiatSymbol }) => {
      if (fiatSymbol) this.fiatSymbol = fiatSymbol;
    }).catch((error) => console.warn('Fiat preference could not be read', error));
  }

  async getFiats() {
    if (this.fiats.length) return this.fiats;

    await this.fetchFiats();

    return this.fiats;
  }

  async fetchFiats() {
    try {
      const { data: fiats } = await axios.get<FiatJson[]>(URLS.FIATS);

      this.fiats = fiats;
    } catch (err) {
      console.info(err);
    }
  }

  refreshPrice() {
    this.fetchTokensPrice()
      .then((rs) => this.setPriceStore(rs))
      .catch((err) => console.info(err));
  }

  setFiatSymbol(symbol: string) {
    if (this.fiatSymbol !== symbol) {
      this.priceStoreReady = false;
      this.priceRevision += 1;
      this.requestRevision += 1;
      this.prices.json = { fiat: symbol, tokenPriceMap: {}, tokenPriceChange: {} };
    }
    this.fiatSymbol = symbol;

    void storage.set({ fiatSymbol: this.fiatSymbol }).catch((error) => console.warn('Fiat preference could not be saved', error));
  }

  setPriceStore(priceData: PriceJson, callback?: (priceData: PriceJson) => void): void {
    this.priceStore.set('PriceData', priceData, () => {
      if (callback) callback(priceData);

      this.priceStoreReady = true;
    });
  }

  getPrice(update: (value: PriceJson) => void): void {
    const revision = this.priceRevision;
    void withDeadline(this.priceStore.getAndWait('PriceData'), 5000, 'Price cache read timed out')
      .catch((error) => {
        console.warn('Price cache could not be read', error);
        return undefined;
      }).then((cached) => {
        if (revision === this.priceRevision && cached?.fiat === this.fiatSymbol && cached.tokenPriceMap && cached.tokenPriceChange) {
          this.prices.json = cached;
          this.priceRevision += 1;
        }
        if (this.prices.json.fiat !== this.fiatSymbol) {
          this.prices.json = { fiat: this.fiatSymbol, tokenPriceMap: {}, tokenPriceChange: {} };
          this.priceStoreReady = false;
        }
        // Answer before network work. A failed or hanging provider must not leave the popup waiting.
        update(this.prices.json);
        if (!this.priceStoreReady) this.refreshPrice();
      }).catch((error) => console.warn('Price subscriber could not be updated', error));
  }

  getSubject() {
    return this.priceStore.getSubject();
  }

  getTokenPrice(assetName: string) {
    const name = assetName.replaceAll(' ', '-');

    return this.prices.json.tokenPriceMap[name] ?? 0;
  }

  setPriceValue({ tokenPriceChange, tokenPriceMap }: BasePriceJson) {
    this.priceRevision += 1;
    const previous = this.prices.json.fiat === this.fiatSymbol ? this.prices.json : DEFAULT_PRICES;
    this.prices = {
      json: {
        fiat: this.fiatSymbol,
        tokenPriceChange: { ...previous.tokenPriceChange, ...tokenPriceChange },
        tokenPriceMap: { ...previous.tokenPriceMap, ...tokenPriceMap },
      },
      timestamp: Date.now(),
    };
  }

  async fetchTokensPrice(): Promise<PriceJson> {
    const fiat = this.fiatSymbol;
    const revision = ++this.requestRevision;
    const [tonAssetsPrice, coinGeckoAssetsPrice, soraAssetsPrice] = await Promise.all([
      this.tonPricingService.fetchTonAsstetsPrice(),
      this.coinGeckoService.fetchAssetsPrice(),
      this.soraPricingService.fetchSoraExplorerPricing(),
    ].map((work) => withDeadline(work, 15000, 'Price request timed out').catch((error) => {
      console.warn('Price provider unavailable', error);
      return { tokenPriceMap: {}, tokenPriceChange: {} };
    })));

    if (fiat !== this.fiatSymbol || revision !== this.requestRevision) throw new Error('Price request was superseded');

    const allRates: BasePriceJson = {
      tokenPriceMap: {
        ...coinGeckoAssetsPrice.tokenPriceMap,
        ...soraAssetsPrice.tokenPriceMap,
        ...tonAssetsPrice.tokenPriceMap,
      },
      tokenPriceChange: {
        ...coinGeckoAssetsPrice.tokenPriceChange,
        ...soraAssetsPrice.tokenPriceChange,
        ...tonAssetsPrice.tokenPriceChange,
      },
    };

    this.setPriceValue(allRates);

    return this.prices.json;
  }
}
