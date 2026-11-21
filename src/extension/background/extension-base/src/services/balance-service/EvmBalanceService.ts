import { APIItemState, NETWORK_STATUS } from '@extension-base/api/types/networks';
import { ethers, isError } from 'ethers';
import {
  MULTICALL3_ADDRESS,
  readTokenBalancesDirectly,
  readTokenBalancesWithMulticall,
  type TokenBalances,
} from '@extension-base/services/evm-token-discovery/multicall';
import { REFRESH_TIME } from '../evm-contract-service';
import type State from '@extension-base/background/handlers/State';
import type { ResponseBalanceRequest, FetchBalancePayload, EvmProvider } from '@extension-base/background/types/types';
import type { NetworkJson } from '@extension-base/types';
import { withTimeout } from '@/util/endpointFailover';

/** A balance read the node has not answered by then counts as an outage, so the network moves on to its next node. */
export const EVM_BALANCE_TIMEOUT_MS = 15_000;
/** Without Multicall3 a network's listed tokens are read one call each, and only this many. */
export const EVM_TOKEN_DIRECT_READ_LIMIT = 64;
/** How often a token read follows its network's provider to a replacement before it gives up. */
export const EVM_PROVIDER_REPLACED_RETRIES = 2;

/** A registry token is verified, also when its row began as a token found through the lists before the registry had it. */
const REGISTRY_TRUST = { assetMetadataTrust: 'verified', assetMetadataSource: 'registry' } as const;

/** A token to read outside the registry: found before (its balance row) or on the network's list. */
interface TokenTarget {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  found: boolean;
}

class EvmBalanceTimeoutError extends Error {
  constructor() {
    super('evm_balance_timeout');
  }
}

/**
 * Whether a failed read says the node is unusable (refused, an HTTP error, no answer in time, another chain, a provider
 * replaced mid-request) rather than answering for the chain. A reverted or undecodable call is the chain's answer about
 * that contract, and every other node would give it too.
 */
export function isEvmNodeFailure(error: unknown): boolean {
  return !(isError(error, 'CALL_EXCEPTION') || isError(error, 'BAD_DATA') || isError(error, 'INVALID_ARGUMENT'));
}

export default class EvmBalanceService {
  /** Whether each network's node has Multicall3 code, by network name in lower case. */
  private readonly multicall3 = new Map<string, Promise<boolean>>();
  /** The list read running on each network: wallets read a network's list one after another, never at once. */
  private readonly listReads = new Map<string, Promise<unknown>>();

  constructor(private readonly state: State) {}

  async fetchBalance({
    networks,
    ethereumAddress: ethAddress,
    assetId,
    force,
  }: FetchBalancePayload): Promise<ResponseBalanceRequest[]> {
    if (!this.state.isReady()) return [];

    const ethereumAddress = ethAddress ?? this.state.currentAccount?.ethereumAddress ?? '';

    if (ethereumAddress === '') return [];

    const requested = new Set((networks ?? []).map((name) => name.toLowerCase()));
    const filteredNetworks = this.state.networkService.networkValues.filter(
      ({ ecosystem, name }) => ecosystem === 'ethereum' && requested.has(name.toLowerCase())
    );

    const promises: Promise<ResponseBalanceRequest[]>[] = filteredNetworks.map(async (network) => {
      const { assets, name, networkStatus } = network;
      const api = this.state.getEvmApi(name);

      if (!api) return [];

      // An asset's refresh reads only the networks that list it, or where it was found outside the registry; a missing
      // asset would fail the whole network.
      const requestedAssets = assetId ? assets.filter(({ id }) => id === assetId) : assets;
      if (!requestedAssets.length && !(assetId && this.isFoundToken(ethereumAddress, name, assetId))) return [];

      const timeout = api.timeout[ethereumAddress] ?? Number.MIN_VALUE;
      const timeDiff = Date.now() - timeout;
      const shouldSkipUpdate = timeDiff < REFRESH_TIME && !force;

      if (shouldSkipUpdate || networkStatus === NETWORK_STATUS.DISCONNECTED) return [];

      // Save timeout [network api][ethereum address]
      api.timeout[ethereumAddress] = Date.now();
      const address = this.state.keyringService.getSubstrateAddress(ethereumAddress);

      return this.state.balanceService.refreshNetworkBalances(name, address, async () => {
        // Before the registry's reads write their balances: a token found earlier that the registry lists now must be
        // the registry's row by then.
        this.adoptRegistryTokens(network, address);

        const assetsPromises = requestedAssets.map(async ({ id }) => {
          const balance = await this.fetchEvmAssetBalance(ethereumAddress, name, id, this.state);

          return { balance, assetId: id, network: name };
        });
        // Read beside the registry's tokens; it never fails the network's refresh by itself.
        const tokens = this.refreshTokens(network, ethereumAddress, address, { assetId, force: Boolean(force) });

        // Wait for every result even if one request throws before its balance error handler.
        const [results, tokenResults] = await Promise.all([Promise.allSettled(assetsPromises), tokens]);
        return [
          ...results.map((result) => {
            if (result.status === 'rejected') throw result.reason;
            return result.value;
          }),
          ...tokenResults,
        ];
      }, !assetId);
    });

    return (await Promise.all(promises)).flat();
  }

  /** Found tokens the registry lists now become the registry's rows (BalanceService.adoptEvmTokenAsRegistryAsset). */
  private adoptRegistryTokens(network: NetworkJson, address: string): void {
    const balanceService = this.state.balanceService;
    const known = balanceService.getEvmTokenBalances?.(address, network.name) ?? [];

    known.forEach(({ id }) => {
      const registryAsset = network.assets.find((asset) => asset.id.toLowerCase() === id.toLowerCase());

      if (registryAsset) balanceService.adoptEvmTokenAsRegistryAsset(network.name, registryAsset, address);
    });
  }

  private isFoundToken(ethereumAddress: string, network: string, contract: string): boolean {
    const address = this.state.keyringService.getSubstrateAddress(ethereumAddress);

    return Boolean(
      this.state.balanceService.getEvmTokenBalances?.(address, network).some(({ id }) => id.toLowerCase() === contract.toLowerCase())
    );
  }

  /**
   * Reads the ERC-20 tokens outside the registry (docs/evm-token-discovery.md): every time, the tokens found before;
   * when due (EvmTokenDiscoveryService), every token on the network's list. A token with a balance above zero is added,
   * one that holds nothing any more reads 0, and a complete list read removes it. Never throws.
   */
  private async refreshTokens(
    network: NetworkJson,
    ethereumAddress: string,
    address: string,
    { assetId, force }: { assetId?: string; force: boolean }
  ): Promise<ResponseBalanceRequest[]> {
    const balanceService = this.state.balanceService;
    const discovery = this.state.evmTokenDiscoveryService;
    const { name, chainId } = network;

    if (!balanceService.getEvmTokenBalances) return [];

    const registryIds = new Set(network.assets.map(({ id }) => id.toLowerCase()));
    const known = balanceService.getEvmTokenBalances(address, name);
    const targets = new Map<string, TokenTarget>();
    // A read cut short because the network's provider was replaced again and again (the networks followed changed
    // while a wallet was being added) proves nothing about the node: it is not recorded, and the next read tries again.
    const provider = this.state.getEvmApi(name)?.api;
    const interrupted = () => this.state.getEvmApi(name)?.api !== provider;

    known
      .filter(({ id }) => !registryIds.has(id.toLowerCase()) && (!assetId || id.toLowerCase() === assetId.toLowerCase()))
      .forEach(({ id, symbol, tokenName, precision }) =>
        targets.set(id.toLowerCase(), { address: id, symbol, name: tokenName ?? symbol, decimals: precision, found: true })
      );

    let listRead = false;

    if (!assetId && discovery && (await discovery.isScanDue(address, chainId, force).catch(() => false))) {
      try {
        const listed = (await discovery.getTokens(chainId)) ?? [];
        // A network without a list asks its node nothing more. A long list needs Multicall3; without it the network
        // is read for the tokens found before only.
        const readable = listed.length > 0 && (listed.length <= EVM_TOKEN_DIRECT_READ_LIMIT || (await this.hasMulticall3(name)));

        if (readable) {
          listed
            .filter(({ address: token }) => !registryIds.has(token.toLowerCase()) && !targets.has(token.toLowerCase()))
            .forEach((token) => targets.set(token.address.toLowerCase(), { ...token, found: false }));
        }
        listRead = true;
      } catch (error) {
        console.warn(`[EVM tokens] ${name}: the token list could not be read`, error);
        if (!interrupted()) await discovery.recordScan(address, chainId, false);
      }
    }

    if (!targets.size) {
      if (listRead) await discovery?.recordScan(address, chainId, true);
      return [];
    }

    let balances: TokenBalances;

    try {
      const read = () => this.readTokenBalances(name, ethereumAddress, [...targets.values()].map((target) => target.address));

      balances = await (listRead ? this.oneListReadAtATime(name, read) : read());
    } catch (error) {
      console.warn(`[EVM tokens] ${name}: token balances could not be read`, error);
      if (interrupted()) return [];
      targets.forEach((target) => {
        if (target.found) this.setTokenBalance(name, target, APIItemState.ERROR, address);
      });
      if (listRead) await discovery?.recordScan(address, chainId, false);
      return [];
    }

    const results: ResponseBalanceRequest[] = [];
    let complete = true;

    targets.forEach((target) => {
      const raw = balances.get(target.address.toLowerCase());

      if (raw === undefined) {
        complete = false;
        if (target.found) this.setTokenBalance(name, target, APIItemState.ERROR, address);
        return;
      }
      // A complete list read proves the wallet no longer holds it.
      if (raw === 0n && target.found && listRead) {
        balanceService.removeEvmTokenBalanceItem(name, target.address, address);
        return;
      }
      if (raw === 0n && !target.found) return;

      const balance = ethers.formatUnits(raw, target.decimals);

      this.setTokenBalance(name, target, APIItemState.READY, address, balance);
      results.push({ balance, assetId: target.address, network: name });
    });

    if (listRead) await discovery?.recordScan(address, chainId, complete);

    return results;
  }

  private setTokenBalance(network: string, target: TokenTarget, state: APIItemState, address: string, total?: string) {
    this.state.balanceService.setEvmTokenBalanceItem(
      network,
      { id: target.address, symbol: target.symbol, tokenName: target.name, precision: target.decimals, state, total },
      address
    );
  }

  /** Runs a list read once the network's list reads for other wallets have finished. */
  private oneListReadAtATime<T>(network: string, read: () => Promise<T>): Promise<T> {
    const key = network.toLowerCase();
    const next = (this.listReads.get(key) ?? Promise.resolve()).catch(() => undefined).then(read);

    this.listReads.set(key, next);
    next
      .finally(() => {
        if (this.listReads.get(key) === next) this.listReads.delete(key);
      })
      .catch(() => undefined);

    return next;
  }

  /**
   * Runs a request on the network's current provider within EVM_BALANCE_TIMEOUT_MS. A failure does not move the network
   * to its next node: the registry reads beside it do that when the node is down. A request whose provider was replaced
   * while it ran (a failover, a change of the networks followed, which can come twice in a row) is sent again to the
   * new provider, at most EVM_PROVIDER_REPLACED_RETRIES times.
   */
  private async onCurrentProvider<T>(network: string, request: (api: EvmProvider) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      const api = this.state.getEvmApi(network)?.api;

      if (!api) throw new Error('API not found');

      try {
        return await withTimeout(request(api), EVM_BALANCE_TIMEOUT_MS, () => new EvmBalanceTimeoutError());
      } catch (error) {
        const replaced = this.state.getEvmApi(network)?.api;

        if (attempt >= EVM_PROVIDER_REPLACED_RETRIES || !replaced || replaced === api) throw error;
      }
    }
  }

  /** Whether the network's node has Multicall3 code. A failed lookup is not kept, so the next read asks again. */
  private hasMulticall3(network: string): Promise<boolean> {
    const key = network.toLowerCase();
    const cached = this.multicall3.get(key);

    if (cached) return cached;

    const lookup = this.onCurrentProvider(network, (api) => api.getCode(MULTICALL3_ADDRESS)).then((code) => code !== '0x');

    this.multicall3.set(key, lookup);
    lookup.catch(() => {
      if (this.multicall3.get(key) === lookup) this.multicall3.delete(key);
    });

    return lookup;
  }

  /** The owner's balance in each token, through Multicall3 when the network has it. */
  private async readTokenBalances(network: string, owner: string, tokens: string[]): Promise<TokenBalances> {
    const call = (to: string, data: string) => this.onCurrentProvider(network, (api) => api.call({ to, data }));

    if (await this.hasMulticall3(network)) {
      return readTokenBalancesWithMulticall({ call: (data) => call(MULTICALL3_ADDRESS, data), owner, tokens });
    }

    return readTokenBalancesDirectly({ call, owner, tokens: tokens.slice(0, EVM_TOKEN_DIRECT_READ_LIMIT) });
  }

  async fetchEvmAssetBalance(ethereumAddress: string, networkKey: string, assetId: string, state: State) {
    const network = state.networkService.networkMap[networkKey];
    const asset = network.assets.find((asset) => asset.id === assetId);

    if (!asset) throw new Error(`Asset ${assetId} is missing on ${networkKey}`);

    if (asset.isUtility) {
      const balance = await this.fetchUtilityBalance(networkKey, ethereumAddress, state);

      return balance;
    }

    const balance = await this.fetchTokenBalance(ethereumAddress, networkKey, asset.id, state);

    return balance;
  }

  async fetchUtilityBalance(networkKey: string, ethereumAddress: string, state: State) {
    const network = state.networkService.networkMap[networkKey];
    const { id, symbol } = network.assets.find((el) => el.isUtility)!;

    const address = state.keyringService.getSubstrateAddress(ethereumAddress);

    if (!state.getEvmApi(networkKey)?.api) throw new Error('API not found');

    try {
      const balance = await this.readOnNode(networkKey, (api) => api.getBalance(ethereumAddress));
      const utilityBalance = ethers.formatEther(balance);

      state.balanceService.setBalanceItem(
        networkKey,
        {
          state: APIItemState.READY,
          symbol,
          id,
          relayChain: 'ethereum',
          ...REGISTRY_TRUST,
          free: utilityBalance,
          reserved: '0',
          frozen: '0',
          transferable: utilityBalance,
          total: utilityBalance,
        },
        address
      );

      return utilityBalance;
    } catch {
      const cachedBalance = this.getCachedBalance(address, networkKey, id);
      // No amount: setBalanceItem keeps the last confirmed one, and a balance that never loaded stays unknown
      // instead of a confirmed 0 (the first start after the update from 3.0.5 has no balance cache).
      state.balanceService.setBalanceItem(networkKey, { state: APIItemState.ERROR, symbol, id, relayChain: 'ethereum', ...REGISTRY_TRUST }, address);

      return cachedBalance ?? '0';
    }
  }

  async fetchTokenBalance(ethereumAddress: string, networkKey: string, contractAddress: string, state: State) {
    const network = state.networkService.networkMap[networkKey];
    const asset = network.assets.find((el) => el.id === contractAddress);
    const api = state.getEvmApi(networkKey);

    const address = state.keyringService.getSubstrateAddress(ethereumAddress);

    if (!asset) throw new Error(`Asset ${contractAddress} is missing on ${networkKey}`);
    if (!api?.api) throw new Error('API not found');

    const { symbol, precision, id } = asset;

    try {
      const balanceOf = await this.readOnNode(networkKey, async (provider) => {
        const contract = await this.state.evmContractService.getContract(contractAddress, provider);

        return contract.balanceOf(ethereumAddress);
      });

      const balance = ethers.formatUnits(balanceOf, precision);

      state.balanceService.setBalanceItem(
        networkKey,
        {
          state: APIItemState.READY,
          symbol,
          id,
          relayChain: 'ethereum',
          ...REGISTRY_TRUST,
          free: balance,
          reserved: '0',
          frozen: '0',
          transferable: balance,
          total: balance,
        },
        address
      );

      return balance;
    } catch {
      const cachedBalance = this.getCachedBalance(address, networkKey, id);
      // No amount: setBalanceItem keeps the last confirmed one, and a balance that never loaded stays unknown
      // instead of a confirmed 0 (the first start after the update from 3.0.5 has no balance cache).
      state.balanceService.setBalanceItem(networkKey, { state: APIItemState.ERROR, symbol, id, relayChain: 'ethereum', ...REGISTRY_TRUST }, address);

      return cachedBalance ?? '0';
    }
  }

  /**
   * Reads on the network's node within EVM_BALANCE_TIMEOUT_MS. When the node fails, the network moves on to its next
   * node and the read is tried there once, so a dead node costs a moment instead of the balance.
   */
  private async readOnNode<T>(networkKey: string, read: (api: EvmProvider) => Promise<T>): Promise<T> {
    const handler = this.state.networkService.evmApiHandler;
    let api = this.state.getEvmApi(networkKey)?.api;

    for (let attempt = 0; ; attempt += 1) {
      if (!api) throw new Error('API not found');

      try {
        return await withTimeout(read(api), EVM_BALANCE_TIMEOUT_MS, () => new EvmBalanceTimeoutError());
      } catch (error) {
        if (!isEvmNodeFailure(error)) throw error;

        const next = handler.failover(networkKey, api)?.api;

        if (attempt > 0 || !next) throw error;

        api = next;
      }
    }
  }

  private getCachedBalance(address: string, network: string, assetId: string): string | undefined {
    const balance = (this.state.balanceService.balanceMap[address] ?? [])
      .flatMap(({ balances }) => balances)
      .find(({ id, name }) => id === assetId && name.toLowerCase() === network.toLowerCase());

    return balance?.transferable ?? balance?.total ?? balance?.free;
  }
}
