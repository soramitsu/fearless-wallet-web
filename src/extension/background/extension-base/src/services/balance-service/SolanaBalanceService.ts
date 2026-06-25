import { APIItemState } from '@extension-base/api/types/networks';
import {
  SolanaIndexerClient,
  type SolanaNativeBalance,
  type SolanaTokenBalance,
  type SolanaTokenMetadata,
} from '@extension-base/services/solana-indexer-service';
import type State from '@extension-base/background/handlers/State';
import type { ResponseBalanceRequest, TokenGroup } from '@extension-base/background/types/types';
import type { BalanceItem } from '@extension-base/api/evm/types';
import type { FetchBalancePayload } from '@extension-base/background/types/types';
import type { NetworkJson } from '@extension-base/types';
import { isSameString } from '@/helpers';

type SolanaBalanceClient = Pick<SolanaIndexerClient, 'getBalances'> &
  Partial<Pick<SolanaIndexerClient, 'getTokenMetadataBatch' | 'verifyServiceInfo'>>;
type SolanaTokenMetadataByMint = Record<string, SolanaTokenMetadata | undefined>;

const SOLANA_FALLBACK_NETWORK = 'Solana';
const SOLANA_FALLBACK_ASSET_ID = 'SOL';
const SOLANA_FALLBACK_ICON = 'solana';

export default class SolanaBalanceService {
  private serviceInfoVerified = false;

  constructor(
    private readonly state: State,
    private readonly client: SolanaBalanceClient = new SolanaIndexerClient()
  ) {}

  async fetchBalance({
    address,
    solanaAddress,
    networks = [],
  }: FetchBalancePayload & { solanaAddress?: string }): Promise<ResponseBalanceRequest[]> {
    const wallet = solanaAddress ?? address;

    if (!wallet) return [];

    const network = this.getSolanaNetwork(networks);

    if (!network) return [];

    try {
      await this.ensureServiceInfoVerified();

      const { native, tokens } = await this.client.getBalances(wallet);
      const metadataByMint = await this.getTokenMetadataByMint(tokens);

      this.setNativeBalance(address, network, native, APIItemState.READY);
      tokens.forEach((token) => this.setTokenBalance(address, network, token, metadataByMint[token.mint]));

      return [
        { balance: native.uiAmountString, network: network.name, assetId: this.getNativeAsset(network).id },
        ...tokens.map(({ mint, uiAmountString }) => ({ balance: uiAmountString, network: network.name, assetId: mint })),
      ];
    } catch (error) {
      const cachedBalances = this.markCachedBalancesErrored(address, network);

      if (cachedBalances.length) {
        console.warn('Failed to fetch Solana balance, keeping cached balances', error);

        return cachedBalances;
      }

      this.setNativeBalance(address, network, undefined, APIItemState.ERROR);

      console.warn('Failed to fetch Solana balance', error);

      return [{ balance: '0', network: network.name, assetId: this.getNativeAsset(network).id }];
    }
  }

  private async ensureServiceInfoVerified(): Promise<void> {
    if (this.serviceInfoVerified || !this.client.verifyServiceInfo) return;

    await this.client.verifyServiceInfo();
    this.serviceInfoVerified = true;
  }

  private getSolanaNetwork(networks: string[]): NetworkJson | undefined {
    const activeSolanaNetworks = this.state.networkService.activeNetworkByEcosystem.solana;

    if (networks.length) {
      return activeSolanaNetworks.find(({ name }) => networks.some((network) => isSameString(network, name)));
    }

    return activeSolanaNetworks[0] ?? this.state.networkService.networkMap[SOLANA_FALLBACK_NETWORK];
  }

  private getNativeAsset(network: NetworkJson): { id: string; icon: string; precision: number; symbol: string } {
    const asset = network.assets.find(({ isUtility, isNative, symbol }) => isUtility || isNative || symbol === 'SOL');

    return {
      id: asset?.id ?? SOLANA_FALLBACK_ASSET_ID,
      icon: asset?.icon ?? SOLANA_FALLBACK_ICON,
      precision: asset?.precision ?? 9,
      symbol: asset?.symbol ?? 'SOL',
    };
  }

  private setNativeBalance(
    address: string,
    network: NetworkJson,
    native: SolanaNativeBalance | undefined,
    state: APIItemState
  ): void {
    const { id, icon, precision, symbol } = this.getNativeAsset(network);
    const balance = native?.uiAmountString ?? '0';
    const tokenGroup = this.getOrCreateTokenGroup(address, network, id, icon, symbol);
    const balanceItem: BalanceItem = {
      address,
      icon: network.icon || icon,
      id,
      isNative: true,
      isUtility: true,
      mainNetwork: network.name,
      name: network.name,
      precision,
      relayChain: 'solana',
      reserved: '0',
      frozen: '0',
      locked: '0',
      free: balance,
      total: balance,
      transferable: balance,
      state,
      symbol,
      type: 'solana',
      timestamp: Date.now(),
    };
    const existingIndex = tokenGroup.balances.findIndex(({ name }) => isSameString(name, network.name));

    if (existingIndex === -1) tokenGroup.balances.push(balanceItem);
    else tokenGroup.balances[existingIndex] = { ...tokenGroup.balances[existingIndex], ...balanceItem };

    this.state.balanceService.updateBalanceStore(network.name, balanceItem, address);
    this.state.timeoutService.lazyNext('setSolanaBalanceItem', () => this.state.balanceService.publishBalance(), 500);
  }

  private markCachedBalancesErrored(address: string, network: NetworkJson): ResponseBalanceRequest[] {
    const groups = this.state.balanceService.balanceMap[address] ?? [];
    const balances: ResponseBalanceRequest[] = [];

    groups
      .filter(({ relayChain }) => relayChain === 'solana')
      .forEach((group) => {
        const balanceIndex = group.balances.findIndex(({ name }) => isSameString(name, network.name));

        if (balanceIndex < 0) return;

        const existing = group.balances[balanceIndex];
        const balanceItem = {
          ...existing,
          state: APIItemState.ERROR,
          timestamp: Date.now(),
        };

        group.balances[balanceIndex] = balanceItem;
        balances.push({ assetId: balanceItem.id, balance: balanceItem.total, network: network.name });
        this.state.balanceService.updateBalanceStore(network.name, balanceItem, address);
      });

    if (balances.length) {
      this.state.timeoutService.lazyNext('setSolanaBalanceItem', () => this.state.balanceService.publishBalance(), 500);
    }

    return balances;
  }

  private async getTokenMetadataByMint(tokens: SolanaTokenBalance[]): Promise<SolanaTokenMetadataByMint> {
    if (!tokens.length || !this.client.getTokenMetadataBatch) return {};

    const mints = [...new Set(tokens.map(({ mint }) => mint))];

    try {
      const { tokens: metadata } = await this.client.getTokenMetadataBatch(mints);

      return metadata.reduce<SolanaTokenMetadataByMint>((result, item) => {
        result[item.mint] = item;
        return result;
      }, {});
    } catch (error) {
      console.warn('Failed to fetch Solana token metadata', error);

      return {};
    }
  }

  private setTokenBalance(
    address: string,
    network: NetworkJson,
    token: SolanaTokenBalance,
    metadata: SolanaTokenMetadata | undefined
  ): void {
    const symbol = this.getTokenSymbol(token, metadata);
    const tokenName = this.getTokenName(token, metadata);
    const icon = network.icon || SOLANA_FALLBACK_ICON;
    const tokenGroup = this.getOrCreateTokenGroup(address, network, token.mint, icon, symbol, tokenName);
    const balance = token.uiAmountString;
    const balanceItem: BalanceItem = {
      address,
      icon,
      id: token.mint,
      isNative: false,
      isUtility: false,
      mainNetwork: network.name,
      name: network.name,
      precision: token.decimals,
      relayChain: 'solana',
      reserved: '0',
      frozen: '0',
      locked: '0',
      free: balance,
      total: balance,
      transferable: balance,
      state: APIItemState.READY,
      symbol,
      type: 'solana',
      timestamp: Date.now(),
      solanaTokenAccountAddress: token.accountAddress,
      solanaTokenExtensions: metadata?.extensions ?? [],
      solanaTokenMint: token.mint,
      solanaTokenProgram: token.program,
      solanaTokenProgramId: token.programId,
      solanaTokenState: token.state,
      solanaTokenTransferFeeConfig: metadata?.transferFeeConfig ?? null,
      solanaTokenTransferHook: metadata?.transferHook ?? null,
    };
    const existingIndex = tokenGroup.balances.findIndex(({ name }) => isSameString(name, network.name));

    if (existingIndex === -1) tokenGroup.balances.push(balanceItem);
    else tokenGroup.balances[existingIndex] = { ...tokenGroup.balances[existingIndex], ...balanceItem };

    this.state.balanceService.updateBalanceStore(network.name, balanceItem, address);
    this.state.timeoutService.lazyNext('setSolanaBalanceItem', () => this.state.balanceService.publishBalance(), 500);
  }

  private getOrCreateTokenGroup(
    address: string,
    network: NetworkJson,
    assetId: string,
    assetIcon: string,
    symbol: string,
    tokenName = symbol
  ): TokenGroup {
    if (!this.state.balanceService.balanceMap[address]) this.state.balanceService.balanceMap[address] = [];

    const existing = this.state.balanceService.balanceMap[address].find(
      ({ groupId, relayChain }) => groupId === assetId && relayChain === 'solana'
    );

    if (existing) return existing;

    const tokenGroup: TokenGroup = {
      balances: [],
      groupId: assetId,
      icon: assetIcon,
      mainNetwork: network.name,
      priceId: symbol,
      providers: [],
      relayChain: 'solana',
      symbol,
      tokenName,
    };

    this.state.balanceService.balanceMap[address].push(tokenGroup);

    return tokenGroup;
  }

  private getTokenSymbol(token: SolanaTokenBalance, metadata: SolanaTokenMetadata | undefined): string {
    return metadata?.symbol?.trim() || this.shortenMint(token.mint);
  }

  private getTokenName(token: SolanaTokenBalance, metadata: SolanaTokenMetadata | undefined): string {
    return metadata?.name?.trim() || token.mint;
  }

  private shortenMint(mint: string): string {
    if (mint.length <= 12) return mint;

    return `${mint.slice(0, 4)}...${mint.slice(-4)}`;
  }
}
