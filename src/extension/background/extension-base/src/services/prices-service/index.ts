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
    });
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
    this.fiatSymbol = symbol;

    storage.set({ fiatSymbol: this.fiatSymbol });
  }

  setPriceStore(priceData: PriceJson, callback?: (priceData: PriceJson) => void): void {
    this.priceStore.set('PriceData', priceData, () => {
      if (callback) callback(priceData);

      this.priceStoreReady = true;
    });
  }

  getPrice(update: (value: PriceJson) => void): void {
    this.priceStore.get('PriceData', (rs) => {
      if (this.priceStoreReady) update(rs);
      else {
        this.fetchTokensPrice()
          .then((rs) => {
            this.setPriceStore(rs);

            update(rs);
          })
          .catch((err) => {
            throw err;
          });
      }
    });
  }

  getSubject() {
    return this.priceStore.getSubject();
  }

  getTokenPrice(assetName: string) {
    const name = assetName.replaceAll(' ', '-');

    return this.prices.json.tokenPriceMap[name] ?? 0;
  }

  setPriceValue({ tokenPriceChange, tokenPriceMap }: BasePriceJson) {
    this.prices = {
      json: {
        fiat: this.fiatSymbol,
        tokenPriceChange: { ...this.prices.json.tokenPriceChange, ...tokenPriceChange },
        tokenPriceMap: { ...this.prices.json.tokenPriceMap, ...tokenPriceMap },
      },
      timestamp: Date.now(),
    };
  }

  async fetchTokensPrice(): Promise<PriceJson> {
    const tonAssetsPrice = await this.tonPricingService.fetchTonAsstetsPrice();
    const coinGeckoAssetsPrice = await this.coinGeckoService.fetchAssetsPrice();
    const soraAssetsPrice = await this.soraPricingService.fetchSoraExplorerPricing();

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
