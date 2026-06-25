import { type RequestGetHistory } from '../../background/types/types';
import type State from '@extension-base/background/handlers/State';
import { type TonEventTokens } from '@/interfaces';
import { TON_ID } from '@/consts/currencies';
import { getJettonAssetId, isSameString } from '@/helpers';

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
      const api = this.state.getTonApiMap[network.toLowerCase()];

      const { walletContract } = this.state.keyringService.tonKeyring.accountSubject.value[address];
      const contactAddress = walletContract.address.toString();

      const history = await api.api.accounts.getAccountEvents(walletContract.address, { limit: 100 });

      const events = history.events.reduce<TonEventTokens>(
        (result, { actions, eventId, timestamp, extra }) => {
          actions.forEach((item) => {
            const { type, status } = item;

            if (type === 'TonTransfer') {
              const amount = item[type]?.amount.toString();
              const to = item[type]?.recipient?.address;
              const from = item[type]?.sender?.address;
              const comment = item[type]?.comment;

              const isOutEvent = isSameString(from?.toString(), contactAddress);

              result[TON_ID].push({
                amount,
                to: to ? this.state.keyringService.tonKeyring.getUserFriendlyAddress(to) : '',
                from: from ? this.state.keyringService.tonKeyring.getUserFriendlyAddress(from) : '',
                comment,
                eventId,
                timestamp,
                method: 'transfer',
                success: status === 'ok',
                symbol: 'ton',
                isOutEvent: isOutEvent,
                networkFee: extra.toString(),
              });

              return;
            }

            if (type === 'JettonTransfer') {
              const amount = item[type]?.amount.toString();
              const to = item[type]?.recipient?.address.toString();
              const from = item[type]?.sender?.address.toString();
              const comment = item[type]?.comment;
              const symbol = item[type]?.jetton.symbol.toLowerCase() ?? '';
              const name = item[type]?.jetton.name.toLowerCase() ?? '';
              const isOutEvent = isSameString(from, contactAddress);

              const groupId = getJettonAssetId(name, symbol);

              if (!result[groupId]) result[groupId] = [];

              result[groupId].push({
                amount,
                to,
                from,
                comment,
                eventId,
                timestamp,
                method: 'transfer',
                success: status === 'ok',
                symbol,
                isOutEvent,
                networkFee: extra.toString(),
              });

              return;
            }

            if (type === 'JettonSwap') {
              const amountIn = item[type]?.amountIn.toString();
              const amountOut = item[type]?.amountOut.toString();
              const dex = item[type]?.dex;
              const userWallet = item[type]?.userWallet.address.toString();
              const symbol = item[type]?.jettonMasterOut?.symbol.toLowerCase() ?? '';
              const name = item[type]?.jettonMasterOut?.name.toLowerCase() ?? '';
              const symbolIn = item[type]?.jettonMasterIn?.symbol.toLowerCase() ?? '';

              const groupId = getJettonAssetId(name, symbol);

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
                success: status === 'ok',
                networkFee: extra.toString(),
              });

              return;
            }

            return;
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
