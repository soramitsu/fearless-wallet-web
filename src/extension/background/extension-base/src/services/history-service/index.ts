import { TonProviderError } from '@extension-base/services/ton-provider';
import { type RequestGetHistory } from '../../background/types/types';
import type State from '@extension-base/background/handlers/State';
import { type TonEventTokens } from '@/interfaces';
import { TON_ID } from '@/consts/currencies';
import { isSameString } from '@/helpers';

// Сейчас здесь парсится только история для тон сети, тк она достается из ноды
// Вся остальная история парсится на клиенте
// TODO возможно стоит перенести парсинг всей истории в SW
export class HistoryService {
  private readonly tonHistoryCache = new Map<string, TonEventTokens>();

  constructor(private state: State) {}

  // Итория транзакций парсится только для TON_MAINNET
  async fetchTonAssetsHistory({ address: _address, network }: RequestGetHistory): Promise<TonEventTokens> {
    const address = _address ?? this.state.currentAccount?.address;

    if (!address) return {};

    const cacheKey = this.getTonHistoryCacheKey(network, address);

    try {
      const provider = this.state.getTonApiMap[network.toLowerCase()]?.api;

      if (!provider) throw new TonProviderError('ton_provider_unavailable', `no TON provider for ${network}`);

      const { walletContract } = this.state.keyringService.tonKeyring.accountSubject.value[address];
      const contactAddress = walletContract.address.toString();

      const history = await provider.getHistory(walletContract.address, 100);

      const events = history.reduce<TonEventTokens>(
        (result, { actions, eventId, timestamp, fee }) => {
          // TI's transactions carry no fee: it stays unknown and is not shown, rather than shown as 0.
          const networkFee = fee;

          actions.forEach((item) => {
            if (item.type === 'ton-transfer') {
              const { amount, recipient: to, sender: from, comment } = item;

              const isOutEvent = isSameString(from?.toString(), contactAddress);

              result[TON_ID].push({
                amount,
                to: to ? this.state.keyringService.tonKeyring.getUserFriendlyAddress(to) : '',
                from: from ? this.state.keyringService.tonKeyring.getUserFriendlyAddress(from) : '',
                comment,
                eventId,
                timestamp,
                method: 'transfer',
                success: item.success,
                symbol: 'ton',
                isOutEvent: isOutEvent,
                networkFee,
              });

              return;
            }

            if (item.type === 'jetton-transfer') {
              const { amount, comment } = item;
              const to = item.recipient?.toString();
              const from = item.sender?.toString();
              const symbol = item.jetton.symbol.toLowerCase();
              const isOutEvent = isSameString(from, contactAddress);
              const groupId = item.jetton.master.toString();

              if (!result[groupId]) result[groupId] = [];

              result[groupId].push({
                amount,
                to,
                from,
                comment,
                eventId,
                timestamp,
                method: 'transfer',
                success: item.success,
                symbol,
                isOutEvent,
                networkFee,
              });

              return;
            }

            if (item.type === 'jetton-swap') {
              const { amountIn, amountOut, dex } = item;
              const userWallet = item.userWallet?.toString();
              const symbol = item.jettonOut?.symbol.toLowerCase() ?? '';
              const symbolIn = item.jettonIn?.symbol.toLowerCase() ?? '';
              const groupId = item.jettonOut?.master.toString() ?? '';

              if (!result[groupId]) result[groupId] = [];

              result[groupId].push({
                amountIn,
                amountOut,
                dex,
                userWallet,
                eventId,
                timestamp,
                method: 'swap',
                symbol,
                symbolIn,
                isOutEvent: true,
                success: item.success,
                networkFee,
              });
            }
          });

          return result;
        },
        { [TON_ID]: [] }
      );

      this.setCachedTonHistory(cacheKey, events);

      return events;
    } catch (error) {
      console.warn('[TON][fetchTonAssetsHistory] Falling back to cached history after fetch error', error);

      return this.getCachedTonHistory(cacheKey);
    }
  }

  private getTonHistoryCacheKey(network: string, address: string): string {
    return `${network.toLowerCase()}:${address}`;
  }

  private setCachedTonHistory(cacheKey: string, history: TonEventTokens): void {
    this.tonHistoryCache.set(cacheKey, this.cloneTonHistory(history));
  }

  private getCachedTonHistory(cacheKey: string): TonEventTokens {
    return this.cloneTonHistory(this.tonHistoryCache.get(cacheKey) ?? { [TON_ID]: [] });
  }

  private cloneTonHistory(history: TonEventTokens): TonEventTokens {
    return Object.entries(history).reduce<TonEventTokens>((result, [assetId, events]) => {
      result[assetId] = events.map((event) => ({ ...event }));

      return result;
    }, {});
  }
}
