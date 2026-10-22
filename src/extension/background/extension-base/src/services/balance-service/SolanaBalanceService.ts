import { APIItemState } from '@extension-base/api/types/networks';
import {
  SolanaIndexerClient,
  type SolanaNativeBalance,
  type SolanaTokenBalance,
  type SolanaTokenMetadata,
} from '@extension-base/services/solana-indexer-service';
import { reconcileSuccessfulDynamicScan } from './reconcileSuccessfulScan';
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
      const aggregatedTokens = this.aggregateTokenBalances(tokens);
      const metadataByMint = await this.getTokenMetadataByMint(aggregatedTokens);

      this.setNativeBalance(address, network, native, APIItemState.READY);
      aggregatedTokens.forEach((token) => this.setTokenBalance(address, network, token, metadataByMint[token.mint]));
      reconcileSuccessfulDynamicScan(this.state, {
        address,
        network: network.name,
        observedAssetIds: aggregatedTokens.map(({ mint }) => mint),
        includes: ({ isNative, isUtility, type }) => type === 'solana' && !isNative && !isUtility,
      });

      return [
        { balance: native.uiAmountString, network: network.name, assetId: this.getNativeAsset(network).id },
        ...aggregatedTokens.map(({ mint, uiAmountString }) => ({
          balance: uiAmountString,
          network: network.name,
          assetId: mint,
        })),
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
      return (
        activeSolanaNetworks.find(({ name }) => networks.some((network) => isSameString(network, name))) ??
        Object.values(this.state.networkService.networkMap).find(
          (candidate) =>
            candidate.ecosystem === 'solana' &&
            networks.some((network) => [candidate.name, candidate.chainId].some((id) => isSameString(network, id)))
        )
      );
    }

    return activeSolanaNetworks[0] ?? this.state.networkService.networkMap[SOLANA_FALLBACK_NETWORK];
  }

  private getNativeAsset(network: NetworkJson): { id: string; icon: string; precision: number; symbol: string; priceId?: string } {
    const asset = network.assets.find(({ isUtility, isNative, symbol }) => isUtility || isNative || symbol === 'SOL');

    return {
      id: asset?.id ?? SOLANA_FALLBACK_ASSET_ID,
      icon: asset?.icon ?? SOLANA_FALLBACK_ICON,
      precision: asset?.precision ?? 9,
      symbol: asset?.symbol ?? 'SOL',
      priceId: asset?.priceId,
    };
  }

  private setNativeBalance(
    address: string,
    network: NetworkJson,
    native: SolanaNativeBalance | undefined,
    state: APIItemState
  ): void {
    const { id, icon, precision, symbol, priceId } = this.getNativeAsset(network);
    const balance = native?.uiAmountString ?? '0';
    const tokenGroup = this.getOrCreateTokenGroup(address, network, id, icon, symbol, symbol, priceId);
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
      assetMetadataTrust: 'verified',
      assetMetadataSource: 'registry',
      priceId,
      scanCoverage: /test|dev/i.test(`${network.name} ${network.chainId}`) ? 'limited' : 'complete',
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
          timestamp: existing.timestamp,
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

  /**
   * Solana wallets can own more than one token account for the same mint. The
   * portfolio identity is the mint, so expose one exact, arbitrary-precision
   * balance while retaining every source account for transfer capability
   * checks. A mint changing decimals or token program is malformed indexer
   * data and must not be silently collapsed into the same AssetKey.
   */
  private aggregateTokenBalances(tokens: SolanaTokenBalance[]): SolanaTokenBalance[] {
    const aggregates = new Map<
      string,
      {
        token: SolanaTokenBalance;
        amount: bigint;
        sourceAmount: bigint;
        accountAddresses: string[];
      }
    >();

    tokens.forEach((token) => {
      if (!/^\d+$/.test(token.amount)) throw new Error(`invalid_solana_token_amount:${token.mint}`);

      const amount = BigInt(token.amount);
      const existing = aggregates.get(token.mint);

      if (!existing) {
        aggregates.set(token.mint, {
          token: { ...token },
          amount,
          sourceAmount: amount,
          accountAddresses: [token.accountAddress],
        });
        return;
      }

      if (
        existing.token.decimals !== token.decimals ||
        existing.token.program !== token.program ||
        existing.token.programId !== token.programId
      ) {
        throw new Error(`inconsistent_solana_token_identity:${token.mint}`);
      }

      existing.amount += amount;
      existing.accountAddresses.push(token.accountAddress);

      // Preserve the largest source account for the existing single-source
      // transfer path. The full source set is stored alongside it.
      if (amount > existing.sourceAmount) {
        existing.token = { ...token };
        existing.sourceAmount = amount;
      }
    });

    return [...aggregates.values()].map(({ token, amount, sourceAmount, accountAddresses }) => ({
      ...token,
      amount: amount.toString(),
      uiAmountString: this.formatRawTokenAmount(amount, token.decimals),
      accountAddresses,
      sourceAmount: sourceAmount.toString(),
    })) as Array<SolanaTokenBalance & { accountAddresses: string[]; sourceAmount: string }>;
  }

  private formatRawTokenAmount(amount: bigint, decimals: number): string {
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
      throw new Error('invalid_solana_token_decimals');
    }

    if (decimals === 0) return amount.toString();

    const padded = amount.toString().padStart(decimals + 1, '0');
    const whole = padded.slice(0, -decimals);
    const fraction = padded.slice(-decimals).replace(/0+$/, '');

    return fraction ? `${whole}.${fraction}` : whole;
  }

  private setTokenBalance(
    address: string,
    network: NetworkJson,
    token: SolanaTokenBalance,
    metadata: SolanaTokenMetadata | undefined
  ): void {
    const aggregatedToken = token as SolanaTokenBalance & { accountAddresses?: string[]; sourceAmount?: string };
    const registryAsset = network.assets.find(({ id, currencyId }) => id === token.mint || currencyId === token.mint);
    const symbol = registryAsset?.symbol ?? this.getTokenSymbol(token, metadata);
    const tokenName = registryAsset?.name ?? this.getTokenName(token, metadata);
    const icon = registryAsset?.icon ?? network.icon ?? SOLANA_FALLBACK_ICON;
    const tokenGroup = this.getOrCreateTokenGroup(
      address,
      network,
      token.mint,
      icon,
      symbol,
      tokenName,
      registryAsset?.priceId
    );
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
      solanaTokenAccountAddresses: aggregatedToken.accountAddresses ?? [token.accountAddress],
      solanaTokenSourceAmount: aggregatedToken.sourceAmount ?? token.amount,
      solanaTokenExtensions: metadata?.extensions ?? [],
      solanaTokenMint: token.mint,
      solanaTokenProgram: token.program,
      solanaTokenProgramId: token.programId,
      solanaTokenState: token.state,
      solanaTokenTransferFeeConfig: metadata?.transferFeeConfig ?? null,
      solanaTokenTransferHook: metadata?.transferHook ?? null,
      assetMetadataTrust: registryAsset ? 'verified' : 'unverified',
      assetMetadataSource: registryAsset ? 'registry' : 'indexer',
      priceId: registryAsset?.priceId,
      scanCoverage: /test|dev/i.test(`${network.name} ${network.chainId}`) ? 'limited' : 'complete',
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
    tokenName = symbol,
    priceId?: string
  ): TokenGroup {
    if (!this.state.balanceService.balanceMap[address]) this.state.balanceService.balanceMap[address] = [];

    const existing = this.state.balanceService.balanceMap[address].find(
      ({ groupId, relayChain }) => groupId === assetId && relayChain === 'solana'
    );

    if (existing) {
      if (priceId) existing.priceId = priceId;
      return existing;
    }

    const tokenGroup: TokenGroup = {
      balances: [],
      groupId: assetId,
      icon: assetIcon,
      mainNetwork: network.name,
      priceId,
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
