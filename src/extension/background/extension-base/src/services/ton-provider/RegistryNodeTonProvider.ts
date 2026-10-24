import {
  TonProviderError,
  type TonAccountBalance,
  type TonDataProvider,
  type TonHistoryAction,
  type TonHistoryEvent,
  type TonJettonScan,
  type TonNetworkKind,
  type TonWalletState,
} from './types';
import type { Address, Cell } from '@ton/core';
import type { AccountEvent, Action, TokenRates, TonApiClient } from '@ton-api/client';

type TonApiClientLike = {
  accounts: Pick<TonApiClient['accounts'], 'getAccount' | 'getAccountJettonsBalances' | 'getAccountEvents'>;
  blockchain: Pick<TonApiClient['blockchain'], 'getBlockchainMasterchainHead' | 'sendBlockchainMessage'>;
  rates: Pick<TonApiClient['rates'], 'getRates'>;
  wallet: Pick<TonApiClient['wallet'], 'getAccountSeqno'>;
};

// The global id every TON block carries (config param 19).
const TON_GLOBAL_IDS: Record<TonNetworkKind, number> = { mainnet: -239, testnet: -3 };

/**
 * TON through the registry's TON node, a TonAPI server (the node 3.0.5 used). Like TI it is used only after it has
 * proven the network: the masterchain head it serves must carry the requested network's global id.
 */
class RegistryNodeTonProvider implements TonDataProvider {
  readonly source = 'registry-node' as const;
  readonly canBroadcast = true;
  private verified = false;

  constructor(
    readonly baseUrl: string,
    readonly network: TonNetworkKind,
    private readonly client: TonApiClientLike
  ) {}

  async verify(): Promise<void> {
    let globalId: number | undefined;

    try {
      ({ globalId } = await this.client.blockchain.getBlockchainMasterchainHead());
    } catch (error) {
      throw new TonProviderError('ton_provider_unverified', `masterchain head: ${describeError(error)}`);
    }

    if (globalId !== TON_GLOBAL_IDS[this.network]) {
      throw new TonProviderError('ton_provider_network_mismatch', `asked for TON ${this.network}, node serves global id ${globalId}`);
    }

    this.verified = true;
  }

  async getAccountBalance(address: Address): Promise<TonAccountBalance> {
    this.assertVerified();

    const { balance, status } = await this.client.accounts.getAccount(address);
    const amount = BigInt(balance);

    return { balance: amount, hasActivity: amount > 0n || String(status) !== 'nonexist' };
  }

  async getJettonBalances(address: Address, currency: string): Promise<TonJettonScan> {
    this.assertVerified();

    const { balances } = await this.client.accounts.getAccountJettonsBalances(address, { currencies: [currency] });

    return {
      holdings: balances.map(({ balance, jetton, walletAddress, price }) => ({
        master: jetton.address,
        wallet: walletAddress.address,
        balance: BigInt(balance),
        decimals: jetton.decimals,
        symbol: jetton.symbol,
        name: jetton.name,
        image: jetton.image,
        verified: String(jetton.verification).toLowerCase() === 'whitelist',
        price,
      })),
      complete: true,
    };
  }

  async getHistory(address: Address, limit: number): Promise<TonHistoryEvent[]> {
    this.assertVerified();

    const { events } = await this.client.accounts.getAccountEvents(address, { limit });

    return events.map(toHistoryEvent);
  }

  async getRates(tokens: string[], currency: string): Promise<Record<string, TokenRates>> {
    this.assertVerified();

    const { rates } = await this.client.rates.getRates({ tokens, currencies: [currency] });

    return rates;
  }

  async getWalletState(address: Address): Promise<TonWalletState> {
    this.assertVerified();

    const { status } = await this.client.accounts.getAccount(address);

    if (String(status) === 'frozen') throw new TonProviderError('ton_provider_invalid_response', 'wallet is frozen');
    if (String(status) !== 'active') return { seqno: 0, deployed: false };

    const { seqno } = await this.client.wallet.getAccountSeqno(address);

    return { seqno, deployed: true };
  }

  async sendMessage(boc: Cell): Promise<void> {
    this.assertVerified();

    await this.client.blockchain.sendBlockchainMessage({ boc });
  }

  private assertVerified(): void {
    if (!this.verified) throw new TonProviderError('ton_provider_unverified', 'network not checked');
  }
}

function toHistoryEvent({ eventId, timestamp, extra, actions }: AccountEvent): TonHistoryEvent {
  return {
    eventId,
    timestamp,
    fee: extra.toString(),
    actions: actions.flatMap(toHistoryAction),
  };
}

function toHistoryAction(action: Action): TonHistoryAction[] {
  const success = action.status === 'ok';

  if (action.type === 'TonTransfer' && action.TonTransfer) {
    const { amount, recipient, sender, comment } = action.TonTransfer;

    return [
      { type: 'ton-transfer', success, amount: amount.toString(), recipient: recipient?.address, sender: sender?.address, comment },
    ];
  }

  if (action.type === 'JettonTransfer' && action.JettonTransfer) {
    const { amount, recipient, sender, comment, jetton } = action.JettonTransfer;

    return [
      {
        type: 'jetton-transfer',
        success,
        amount: amount.toString(),
        recipient: recipient?.address,
        sender: sender?.address,
        comment,
        jetton: { master: jetton.address, symbol: jetton.symbol },
      },
    ];
  }

  if (action.type === 'JettonSwap' && action.JettonSwap) {
    const { amountIn, amountOut, dex, userWallet, jettonMasterIn, jettonMasterOut } = action.JettonSwap;

    return [
      {
        type: 'jetton-swap',
        success,
        amountIn: amountIn.toString(),
        amountOut: amountOut.toString(),
        dex: String(dex),
        userWallet: userWallet?.address,
        jettonIn: jettonMasterIn ? { master: jettonMasterIn.address, symbol: jettonMasterIn.symbol } : undefined,
        jettonOut: jettonMasterOut ? { master: jettonMasterOut.address, symbol: jettonMasterOut.symbol } : undefined,
      },
    ];
  }

  return [];
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export { RegistryNodeTonProvider, TON_GLOBAL_IDS, type TonApiClientLike };
