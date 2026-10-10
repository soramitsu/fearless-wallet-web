// @vitest-environment node
/**
 * Solana send end-to-end against a local `solana-test-validator` only. Drives
 * the wallet's real background send code (`makeSolanaTransfer`,
 * `quoteSolanaTransfer`), real JSON-RPC client and the RPC balance reader. Run
 * with `node scripts/test-local-chain-sends.mjs`; skipped otherwise.
 */
import {
  SPL_TOKEN_PROGRAM_ADDRESS,
  deriveAssociatedTokenAddress,
  lamportsToSolString,
  makeSolanaTransfer,
  quoteSolanaTransfer,
} from '@extension-base/api/solana/transfer';
import { createSolanaRpcBalanceClient } from '@extension-base/services/balance-service/solanaRpcBalances';
import { SolanaRpcClient, SolanaRpcError } from '@extension-base/services/solana-rpc-service';
import vectors from '../../docs/universal-wallet-v2-vectors.json';
import { randomSolanaAddress } from '../../scripts/local-chains/solana-genesis-accounts.mjs';
import type { SolanaPendingSend } from '@extension-base/api/solana/pendingSends';
import type State from '@extension-base/background/handlers/State';
import type { NetworkJson } from '@extension-base/types';
import { WalletEcosystem } from '@/interfaces';

// Modules see Vite's `process` polyfill; the runner's variables live on Node's own process.
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const RPC_URL = env.FEARLESS_E2E_SOLANA_RPC_URL;
const MINT = env.FEARLESS_E2E_SOLANA_MINT ?? '';
const mnemonic = vectors.vectors[0].mnemonic;
const walletAddress = vectors.vectors[0].expected.solana.address;
const NETWORK_KEY = 'Solana Local';

describe.skipIf(!RPC_URL)('Solana send on a local test validator', () => {
  const rpc = new SolanaRpcClient({ rpcUrls: [RPC_URL!] });
  const balances = createSolanaRpcBalanceClient(rpc);
  const tokenBalanceItem = async () => {
    const { tokens } = await balances.getBalances(walletAddress);
    const token = tokens.find(({ mint }) => mint === MINT)!;

    return {
      id: MINT,
      name: NETWORK_KEY,
      precision: token.decimals,
      solanaTokenAccountAddress: token.accountAddress,
      solanaTokenExtensions: [],
      solanaTokenMint: MINT,
      solanaTokenProgram: token.program,
      solanaTokenProgramId: token.programId,
      solanaTokenSourceAmount: token.amount,
      solanaTokenState: token.state,
      solanaTokenTransferFeeConfig: null,
      solanaTokenTransferHook: null,
    };
  };
  let currentTokenItem: Awaited<ReturnType<typeof tokenBalanceItem>>;
  const state = {
    balanceService: {
      fetchBalance: vi.fn(async () => []),
      getTokenBalance: vi.fn(() => ({ balances: [currentTokenItem], groupId: MINT, relayChain: 'solana' })),
    },
    keyringService: {
      exportMnemonic: vi.fn(() => ({ seed: mnemonic })),
      getAllAccounts: vi.fn(() => [
        { address: 'e2e-account', meta: { solanaAddress: walletAddress, walletEcosystem: WalletEcosystem.Substrate } },
      ]),
    },
    networkService: {
      networkMap: {
        [NETWORK_KEY]: {
          chainId: 'solana:devnet',
          currentProvider: 'local',
          customNodes: [],
          ecosystem: 'solana',
          key: NETWORK_KEY,
          name: NETWORK_KEY,
          nodes: [],
          options: ['testnet'],
          providers: { local: RPC_URL },
        } as unknown as NetworkJson,
      },
    },
  } as unknown as State;
  let pendingRecords: SolanaPendingSend[] = [];
  const pendingStore = {
    list: async () => pendingRecords,
    remove: async (signatures: string[]) => {
      pendingRecords = pendingRecords.filter(({ signature }) => !signatures.includes(signature));
    },
    save: async (record: SolanaPendingSend) => {
      pendingRecords = [...pendingRecords, record];
    },
  };
  const options = { maxConfirmationWaitMs: 150_000, pendingStore, pollIntervalMs: 500 };
  const params = (to: string, amount: string, assetId = 'SOL') => ({
    amount,
    assetId,
    callback: vi.fn(),
    from: 'e2e-account',
    networkKey: NETWORK_KEY,
    state,
    to,
  });
  const lamports = async (address: string) => BigInt(await rpc.getBalance(address));
  const tokenAmount = async (owner: string) => {
    const account = await rpc.getAccountInfo(deriveAssociatedTokenAddress({ mint: MINT, owner }));
    const info = (account?.data as { parsed?: { info?: { tokenAmount?: { amount: string } } } })?.parsed?.info;

    return account ? BigInt(info?.tokenAmount?.amount ?? '0') : null;
  };
  const toLamports = (sol: string) => {
    const [whole, fraction = ''] = sol.split('.');

    return BigInt(whole) * 1_000_000_000n + BigInt(fraction.padEnd(9, '0'));
  };

  beforeAll(async () => {
    process.env.VUE_APP_ENABLE_SOLANA_TRANSFERS = 'true';
    currentTokenItem = await tokenBalanceItem();
  });

  it('sends SOL to a new account, confirms it and charges exactly the quoted fee', async () => {
    const recipient = randomSolanaAddress();
    const before = await lamports(walletAddress);
    const quote = await quoteSolanaTransfer(params(recipient, '1.5'), rpc);
    const transfer = params(recipient, '1.5');

    expect(quote.unavailableReason).toBeUndefined();
    expect(quote.accountCreationDeposit).toBe('0');

    await makeSolanaTransfer({ ...transfer, solanaComputeUnitPriceMicroLamports: quote.computeUnitPriceMicroLamports }, rpc, options);

    expect(transfer.callback).toHaveBeenCalledWith({ status: true });
    expect(await lamports(recipient)).toBe(1_500_000_000n);
    expect(before - (await lamports(walletAddress))).toBe(1_500_000_000n + toLamports(quote.fee));
    expect(pendingRecords).toEqual([]);
  });

  it('refuses a first deposit below the rent-exempt minimum without sending anything', async () => {
    const before = await lamports(walletAddress);

    await expect(makeSolanaTransfer(params(randomSolanaAddress(), '0.0001'), rpc, options)).rejects.toThrow(
      'solana_amount_below_rent'
    );
    expect(await lamports(walletAddress)).toBe(before);
  });

  it('sends a token, creating the recipient token account once and charging its deposit', async () => {
    const recipient = randomSolanaAddress();
    const beforeSol = await lamports(walletAddress);
    const beforeTokens = BigInt(currentTokenItem.solanaTokenSourceAmount);
    const firstQuote = await quoteSolanaTransfer(params(recipient, '12.5', MINT), rpc);

    expect(firstQuote.accountCreationDeposit).toBe('0.00203928');

    await makeSolanaTransfer({ ...params(recipient, '12.5', MINT), solanaComputeUnitPriceMicroLamports: firstQuote.computeUnitPriceMicroLamports }, rpc, options);

    expect(await tokenAmount(recipient)).toBe(12_500_000n);
    expect(beforeSol - (await lamports(walletAddress))).toBe(toLamports(firstQuote.fee));

    currentTokenItem = await tokenBalanceItem();
    expect(BigInt(currentTokenItem.solanaTokenSourceAmount)).toBe(beforeTokens - 12_500_000n);

    const secondQuote = await quoteSolanaTransfer(params(recipient, '0.5', MINT), rpc);
    const beforeSecond = await lamports(walletAddress);

    expect(secondQuote.accountCreationDeposit).toBe('0');

    await makeSolanaTransfer({ ...params(recipient, '0.5', MINT), solanaComputeUnitPriceMicroLamports: secondQuote.computeUnitPriceMicroLamports }, rpc, options);

    expect(await tokenAmount(recipient)).toBe(13_000_000n);
    expect(beforeSecond - (await lamports(walletAddress))).toBe(toLamports(secondQuote.fee));
    currentTokenItem = await tokenBalanceItem();
  });

  it('refuses token accounts and programs as SOL recipients', async () => {
    const holder = randomSolanaAddress();

    await makeSolanaTransfer(params(holder, '0.25', MINT), rpc, options);
    currentTokenItem = await tokenBalanceItem();

    await expect(
      makeSolanaTransfer(params(deriveAssociatedTokenAddress({ mint: MINT, owner: holder }), '0.1'), rpc, options)
    ).rejects.toThrow('solana_recipient_token_account');
    await expect(makeSolanaTransfer(params(SPL_TOKEN_PROGRAM_ADDRESS, '0.1'), rpc, options)).rejects.toThrow(
      'solana_recipient_program'
    );
  });

  it('confirms exactly one transfer when the first broadcast response is lost', async () => {
    const recipient = randomSolanaAddress();
    let calls = 0;
    const flaky = Object.assign(new SolanaRpcClient({ rpcUrls: [RPC_URL!] }), {});
    const forward = flaky.sendRawTransaction.bind(flaky);

    flaky.sendRawTransaction = async (transaction: string, sendOptions?: Parameters<typeof forward>[1]) => {
      calls += 1;
      if (calls === 1) throw new SolanaRpcError('solana_rpc_unavailable');

      return forward(transaction, sendOptions);
    };

    await makeSolanaTransfer(params(recipient, '0.7'), flaky, options);

    expect(calls).toBeGreaterThanOrEqual(2);
    expect(await lamports(recipient)).toBe(700_000_000n);
    expect(pendingRecords).toEqual([]);
  });

  it('lands exactly one transfer when a node relays it but its answer is lost and the next node is asked', async () => {
    const recipient = randomSolanaAddress();
    const lostUrl = `${RPC_URL!.replace(/\/+$/u, '')}/lost-response`;
    const posts: Array<{ skipPreflight: unknown; url: string }> = [];
    const fetchFn = async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body));

      if (body.method === 'sendTransaction') posts.push({ skipPreflight: body.params[1].skipPreflight, url });
      if (url !== lostUrl) return fetch(url, init);

      const relayed = await fetch(RPC_URL!, init);

      // This node relays the transaction, but its answer never arrives.
      return body.method === 'sendTransaction' ? new Promise<Response>(() => {}) : relayed;
    };
    const failover = new SolanaRpcClient({ fetchFn, requestTimeoutMs: 2_000, rpcUrls: [lostUrl, RPC_URL!] });
    const transfer = params(recipient, '0.4');

    await makeSolanaTransfer(transfer, failover, options);

    // Reported as sent, not as "nothing was sent", and paid exactly once.
    expect(transfer.callback).toHaveBeenCalledWith({ status: true });
    expect(posts.slice(0, 2)).toEqual([
      { skipPreflight: false, url: lostUrl },
      { skipPreflight: true, url: RPC_URL!.replace(/\/+$/u, '') },
    ]);
    expect(await lamports(recipient)).toBe(400_000_000n);
    expect(pendingRecords).toEqual([]);
  });

  it('reports a transaction that never reached the network as expired, with nothing sent', async () => {
    const recipient = randomSolanaAddress();
    const before = await lamports(walletAddress);
    const silent = new SolanaRpcClient({ rpcUrls: [RPC_URL!] });

    silent.sendRawTransaction = async () => {
      throw new SolanaRpcError('solana_rpc_unavailable');
    };

    await expect(makeSolanaTransfer(params(recipient, '0.3'), silent, options)).rejects.toThrow('solana_transaction_expired');
    expect(await rpc.getAccountInfo(recipient)).toBeNull();
    expect(await lamports(walletAddress)).toBe(before);
    expect(pendingRecords).toEqual([]);
  });

  it('sends the quoted SOL maximum, leaving the account empty', async () => {
    const recipient = randomSolanaAddress();
    const quote = await quoteSolanaTransfer(params(recipient, '0'), rpc);

    expect(toLamports(quote.maxSendable)).toBe((await lamports(walletAddress)) - toLamports(quote.fee));

    await makeSolanaTransfer(
      { ...params(recipient, quote.maxSendable), solanaComputeUnitPriceMicroLamports: quote.computeUnitPriceMicroLamports },
      rpc,
      options
    );

    expect(await lamports(walletAddress)).toBe(0n);
    expect(lamportsToSolString(await lamports(recipient))).toBe(quote.maxSendable);
  });
});
