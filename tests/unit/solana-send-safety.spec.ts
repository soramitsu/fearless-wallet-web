import {
  COMPUTE_BUDGET_PROGRAM_ADDRESS,
  SOLANA_COMPUTE_UNIT_LIMITS,
  SPL_TOKEN_PROGRAM_ADDRESS,
  SYSTEM_PROGRAM_ADDRESS,
  deriveAssociatedTokenAddress,
  isOnEd25519Curve,
  lamportsToSolString,
  makeSolanaTransfer,
  prepareSolanaTransferForTest,
  quoteSolanaTransfer,
  type SolanaTransferClient,
} from '@extension-base/api/solana/transfer';
import { resolveSolanaPendingSends, type SolanaPendingSend } from '@extension-base/api/solana/pendingSends';
import { SolanaRpcClient, SolanaRpcError } from '@extension-base/services/solana-rpc-service';
import { createSolanaRpcBalanceClient } from '@extension-base/services/balance-service/solanaRpcBalances';
import { base58Decode } from '@polkadot/util-crypto';
import vectors from '../../docs/universal-wallet-v2-vectors.json';
import type State from '@extension-base/background/handlers/State';
import type { NetworkJson } from '@extension-base/types';
import { WalletEcosystem } from '@/interfaces';
import { parseSolanaSerializedTransaction } from '@/util/solanaTransaction';

const mnemonic = vectors.vectors[0].mnemonic;
const solanaAddress = vectors.vectors[0].expected.solana.address;
const recipient = vectors.vectors[1].expected.solana.address;
const blockhash = '7GjNiPun3AzEazTZoFEjZgcBMeuaXdpjHq2raZTmTrfs';
const tokenMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const otherMint = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
const sourceTokenAccount = '5N3f1tj9v1vc5TUZ8S7mCAnVmjVKrfnzXWhxLaxyZAgt';
const recipientTokenAccount = deriveAssociatedTokenAddress({ mint: tokenMint, owner: recipient });
const originalSolanaFlag = process.env.VUE_APP_ENABLE_SOLANA_TRANSFERS;

const SYSTEM_ACCOUNT = { data: ['', 'base64'], executable: false, lamports: 5_000_000, owner: SYSTEM_PROGRAM_ADDRESS };
const tokenAccount = (mint: string, owner: string, state = 'initialized') => ({
  data: { parsed: { info: { mint, owner, state, tokenAmount: { amount: '1', decimals: 6 } }, type: 'account' } },
  executable: false,
  lamports: 2_039_280,
  owner: SPL_TOKEN_PROGRAM_ADDRESS,
});

const network = (): NetworkJson =>
  ({
    active: true,
    assets: [{ id: 'SOL', isNative: true, isUtility: true, precision: 9, symbol: 'SOL' }],
    chainId: 'solana:mainnet',
    currentProvider: '',
    customNodes: [],
    ecosystem: 'solana',
    key: 'Solana',
    name: 'Solana',
    nodes: [],
    providers: {},
  }) as unknown as NetworkJson;

const tokenBalance = (sourceAmount = '100000000') => ({
  id: tokenMint,
  name: 'Solana',
  precision: 6,
  solanaTokenAccountAddress: sourceTokenAccount,
  solanaTokenExtensions: [],
  solanaTokenMint: tokenMint,
  solanaTokenProgram: 'spl-token',
  solanaTokenProgramId: SPL_TOKEN_PROGRAM_ADDRESS,
  solanaTokenSourceAmount: sourceAmount,
  solanaTokenState: 'initialized',
  solanaTokenTransferFeeConfig: null,
  solanaTokenTransferHook: null,
});

const createState = (token = tokenBalance()) =>
  ({
    balanceService: {
      fetchBalance: vi.fn(async () => []),
      getTokenBalance: vi.fn(() => ({ balances: [token], groupId: tokenMint, relayChain: 'solana' })),
    },
    keyringService: {
      exportMnemonic: vi.fn(() => ({ seed: mnemonic })),
      getAllAccounts: vi.fn(() => [
        { address: 'stored-account', meta: { solanaAddress, walletEcosystem: WalletEcosystem.Substrate } },
      ]),
    },
    networkService: { networkMap: { Solana: network() } },
  }) as unknown as State;

function createClient({
  accounts = { [recipient]: SYSTEM_ACCOUNT },
  balanceLamports = 2_000_000_000,
  blockHeights = [400],
  fees = [0, 10_000, 20_000, 30_000],
  sendError,
  statuses = [{ confirmationStatus: 'confirmed', confirmations: 1, err: null, slot: 130 }],
}: {
  accounts?: Record<string, unknown>;
  balanceLamports?: number;
  blockHeights?: number[];
  fees?: number[];
  sendError?: Error;
  statuses?: unknown[];
} = {}) {
  let statusIndex = 0;
  let heightIndex = 0;

  return {
    getAccountInfo: vi.fn(async (address: string) => (accounts[address] ?? null) as never),
    getBalance: vi.fn(async () => balanceLamports),
    getBlockHeight: vi.fn(async () => blockHeights[Math.min(heightIndex++, blockHeights.length - 1)]),
    getFeeForMessage: vi.fn(async (message: string) => {
      const parsed = parseSolanaSerializedTransaction(
        new Uint8Array([1, ...new Uint8Array(64), ...Uint8Array.from(atob(message), (char) => char.charCodeAt(0))])
      );
      const price = parsed.accountKeys.includes(COMPUTE_BUDGET_PROGRAM_ADDRESS) ? 1 : 0;

      return { context: { slot: 1 }, value: 5_000 + price * 20 };
    }),
    getLatestBlockhash: vi.fn(async () => ({ context: { slot: 1 }, value: { blockhash, lastValidBlockHeight: 456 } })),
    getMinimumBalanceForRentExemption: vi.fn(async (bytes: number) => (bytes === 0 ? 890_880 : 2_039_280)),
    getRecentPrioritizationFees: vi.fn(async () => fees.map((prioritizationFee, slot) => ({ prioritizationFee, slot }))),
    getSignatureStatuses: vi.fn(async () => [statuses[Math.min(statusIndex++, statuses.length - 1)] as never]),
    sendRawTransaction: vi.fn(async (transaction: string) => {
      if (sendError) throw sendError;

      const bytes = Uint8Array.from(atob(transaction), (char) => char.charCodeAt(0));
      const { base58Encode } = await import('@polkadot/util-crypto');

      return base58Encode(bytes.slice(1, 65));
    }),
    simulateTransaction: vi.fn(async () => ({ context: { slot: 1 }, value: { err: null, logs: [] } })),
  } satisfies SolanaTransferClient;
}

const memoryPendingStore = (initial: SolanaPendingSend[] = []) => {
  let records = [...initial];

  return {
    list: vi.fn(async () => records),
    remove: vi.fn(async (signatures: string[]) => {
      records = records.filter(({ signature }) => !signatures.includes(signature));
    }),
    save: vi.fn(async (record: SolanaPendingSend) => {
      records = [...records, record];
    }),
    get records() {
      return records;
    },
  };
};

const sendOptions = (pendingStore = memoryPendingStore(), maxConfirmationWaitMs = 10_000) => {
  let clock = 0;

  return {
    maxConfirmationWaitMs,
    now: () => clock,
    pendingStore,
    pollIntervalMs: 1_000,
    sleep: async (ms: number) => {
      clock += ms;
    },
  };
};

const solParams = (overrides: Record<string, unknown> = {}) => ({
  amount: '0.5',
  assetId: 'SOL',
  callback: vi.fn(),
  from: 'stored-account',
  networkKey: 'Solana',
  state: createState(),
  to: recipient,
  ...overrides,
});

const tokenParams = (overrides: Record<string, unknown> = {}) =>
  solParams({ amount: '12.5', assetId: tokenMint, ...overrides });

const programAddressesOf = (transaction: Uint8Array) => {
  const parsed = parseSolanaSerializedTransaction(transaction);

  return parsed.accountKeys;
};

beforeEach(() => {
  process.env.VUE_APP_ENABLE_SOLANA_TRANSFERS = 'true';
});

afterEach(() => {
  if (originalSolanaFlag === undefined) delete process.env.VUE_APP_ENABLE_SOLANA_TRANSFERS;
  else process.env.VUE_APP_ENABLE_SOLANA_TRANSFERS = originalSolanaFlag;
});

describe('Solana recipient validation', () => {
  it.each([
    ['an executable program', { executable: true, lamports: 1, owner: 'BPFLoaderUpgradeab1e11111111111111111111111', data: [] }, 'solana_recipient_program'],
    ['a token account', tokenAccount(tokenMint, solanaAddress), 'solana_recipient_token_account'],
    ['a program-owned data account', { data: [], executable: false, lamports: 1, owner: 'Stake11111111111111111111111111111111111111' }, 'solana_recipient_program'],
  ])('refuses SOL sent to %s', async (_label, account, code) => {
    const client = createClient({ accounts: { [recipient]: account } });

    await expect(prepareSolanaTransferForTest(solParams(), client)).rejects.toThrow(code);
  });

  it('refuses an off-curve address that is not an existing System account', async () => {
    expect(isOnEd25519Curve(base58Decode(recipientTokenAccount))).toBe(false);

    await expect(prepareSolanaTransferForTest(solParams({ to: recipientTokenAccount }), createClient({ accounts: {} }))).rejects.toThrow(
      'solana_recipient_off_curve'
    );
    // A funded off-curve System account (for example a multisig vault) is accepted.
    await expect(
      prepareSolanaTransferForTest(
        solParams({ to: recipientTokenAccount }),
        createClient({ accounts: { [recipientTokenAccount]: SYSTEM_ACCOUNT } })
      )
    ).resolves.toMatchObject({ recipient: recipientTokenAccount });
  });

  it('credits a pasted token account of the same mint directly and refuses one for another mint', async () => {
    const direct = await prepareSolanaTransferForTest(
      tokenParams({ to: recipientTokenAccount }),
      createClient({ accounts: { [recipientTokenAccount]: tokenAccount(tokenMint, recipient) } })
    );

    expect(direct.destination).toEqual({ createTokenAccount: false, kind: 'token-account', tokenAccount: recipientTokenAccount });
    expect(direct.accountCreationLamports).toBe(0n);
    expect(programAddressesOf(direct.unsignedTransaction)).not.toContain('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

    await expect(
      prepareSolanaTransferForTest(
        tokenParams({ to: recipientTokenAccount }),
        createClient({ accounts: { [recipientTokenAccount]: tokenAccount(otherMint, recipient) } })
      )
    ).rejects.toThrow('solana_recipient_token_account');
  });
});

describe('Solana rent and balance checks', () => {
  it('refuses a first deposit below the rent-exempt minimum to a new account', async () => {
    await expect(
      prepareSolanaTransferForTest(solParams({ amount: '0.0005' }), createClient({ accounts: {} }))
    ).rejects.toThrow('solana_amount_below_rent');
    await expect(
      prepareSolanaTransferForTest(solParams({ amount: '0.0005' }), createClient())
    ).resolves.toMatchObject({ amountBaseUnits: 500_000n });
  });

  it('refuses to leave the sender below the rent-exempt minimum but allows sending everything', async () => {
    const client = createClient({ balanceLamports: 1_000_000_000 });
    const quote = await quoteSolanaTransfer(solParams({ amount: '0' }), client);
    const fee = BigInt(Math.round(Number(quote.fee) * 1e9));

    await expect(prepareSolanaTransferForTest(solParams({ amount: '0.9995' }), client)).rejects.toThrow(
      'solana_sender_below_rent'
    );
    expect(quote.maxSendable).toBe(lamportsToSolString(1_000_000_000n - fee));
    await expect(
      prepareSolanaTransferForTest(solParams({ amount: quote.maxSendable }), client)
    ).resolves.toMatchObject({ amountBaseUnits: 1_000_000_000n - fee });
  });

  it('charges the recipient token-account deposit and refuses when SOL cannot cover it', async () => {
    const quote = await quoteSolanaTransfer(tokenParams(), createClient());

    expect(quote).toMatchObject({ accountCreationDeposit: '0.00203928', maxSendable: '100', recipientIsTokenAccount: false });
    expect(Number(quote.fee)).toBeGreaterThan(0.00203928);

    await expect(
      prepareSolanaTransferForTest(tokenParams(), createClient({ balanceLamports: 2_000_000 }))
    ).rejects.toThrow('solana_insufficient_sol_for_fee');
    await expect(
      prepareSolanaTransferForTest(tokenParams({ amount: '100.000001' }), createClient())
    ).rejects.toThrow('solana_insufficient_token_balance');
  });

  it('reports problems in a quote instead of throwing', async () => {
    const quote = await quoteSolanaTransfer(
      solParams({ to: recipientTokenAccount }),
      createClient({ accounts: { [recipientTokenAccount]: tokenAccount(tokenMint, recipient) } })
    );

    expect(quote.unavailableReason).toBe('solana_recipient_token_account');
  });
});

describe('Solana priority fee', () => {
  it('adds bounded compute-budget instructions from recent fees', async () => {
    const prepared = await prepareSolanaTransferForTest(solParams(), createClient({ fees: [0, 0, 5_000_000, 9_000_000] }));

    expect(programAddressesOf(prepared.unsignedTransaction)).toContain(COMPUTE_BUDGET_PROGRAM_ADDRESS);
    expect(prepared.computeUnitLimit).toBe(SOLANA_COMPUTE_UNIT_LIMITS.native);
    expect(prepared.computeUnitPriceMicroLamports).toBe(2_000_000);

    const quiet = await prepareSolanaTransferForTest(solParams(), createClient({ fees: [0, 0, 0, 0] }));

    expect(quiet.computeUnitPriceMicroLamports).toBe(1_000);
  });

  it('never pays a higher priority fee than the one quoted', async () => {
    const prepared = await prepareSolanaTransferForTest(
      solParams({ solanaComputeUnitPriceMicroLamports: 7_777 }),
      createClient({ fees: [9_000_000] })
    );

    expect(prepared.computeUnitPriceMicroLamports).toBe(7_777);
  });

  it('uses a larger fixed budget only when a token account is created', async () => {
    const creating = await prepareSolanaTransferForTest(tokenParams(), createClient());
    const existing = await prepareSolanaTransferForTest(
      tokenParams(),
      createClient({ accounts: { [recipient]: SYSTEM_ACCOUNT, [recipientTokenAccount]: tokenAccount(tokenMint, recipient) } })
    );

    expect(creating.computeUnitLimit).toBe(SOLANA_COMPUTE_UNIT_LIMITS.splTokenWithAccountCreation);
    expect(existing.computeUnitLimit).toBe(SOLANA_COMPUTE_UNIT_LIMITS.splToken);
  });
});

describe('Solana confirmation and ambiguous broadcast handling', () => {
  it('waits for confirmation, then reports success and forgets the record', async () => {
    const store = memoryPendingStore();
    const client = createClient({ statuses: [null, { confirmationStatus: 'processed', err: null, slot: 1 }, { confirmationStatus: 'confirmed', err: null, slot: 2 }] });
    const params = solParams();

    await makeSolanaTransfer(params, client, sendOptions(store));

    expect(params.callback).toHaveBeenCalledWith({ status: true });
    expect(client.getSignatureStatuses).toHaveBeenCalledTimes(3);
    expect(store.save).toHaveBeenCalledOnce();
    expect(store.records).toEqual([]);
  });

  it('reports an on-chain failure without claiming the amount was sent', async () => {
    const store = memoryPendingStore();
    const client = createClient({ statuses: [{ confirmationStatus: 'confirmed', err: { InstructionError: [0, 'Custom'] }, slot: 1 }] });

    await expect(makeSolanaTransfer(solParams(), client, sendOptions(store))).rejects.toThrow('solana_transaction_failed');
    expect(store.records).toEqual([]);
  });

  it('reports an expired blockhash as nothing sent, so a retry is safe', async () => {
    const store = memoryPendingStore();
    const client = createClient({ blockHeights: [457], statuses: [null] });

    await expect(makeSolanaTransfer(solParams(), client, sendOptions(store))).rejects.toThrow('solana_transaction_expired');
    expect(store.records).toEqual([]);
  });

  it('keeps polling after a lost broadcast response and rebroadcasts the same bytes', async () => {
    const store = memoryPendingStore();
    const client = createClient({
      sendError: new SolanaRpcError('solana_rpc_unavailable'),
      statuses: [null, null, { confirmationStatus: 'confirmed', err: null, slot: 3 }],
    });

    await makeSolanaTransfer(solParams(), client, sendOptions(store));

    const sent = client.sendRawTransaction.mock.calls.map(([transaction]) => transaction);

    expect(new Set(sent).size).toBe(1);
    expect(sent.length).toBeGreaterThanOrEqual(2);
    expect(store.records).toEqual([]);
  });

  it('keeps the record and refuses a new send while the outcome is unknown', async () => {
    const store = memoryPendingStore();
    const client = createClient({ blockHeights: [100], statuses: [null] });

    await expect(makeSolanaTransfer(solParams(), client, sendOptions(store, 5_000))).rejects.toThrow(
      'solana_broadcast_ambiguous'
    );
    expect(store.records).toHaveLength(1);

    const prepareSpy = createClient({ blockHeights: [100], statuses: [null] });

    await expect(makeSolanaTransfer(solParams({ amount: '0.1' }), prepareSpy, sendOptions(store))).rejects.toThrow(
      'solana_previous_send_pending'
    );
    expect(prepareSpy.getLatestBlockhash).not.toHaveBeenCalled();
    // The in-flight transaction itself was rebroadcast unchanged.
    expect(prepareSpy.sendRawTransaction).toHaveBeenCalledWith(store.records[0].transactionBase64, {
      maxRetries: 0,
      skipPreflight: true,
    });
  });

  it('lets a new send through once the earlier one landed or expired', async () => {
    const store = memoryPendingStore([
      {
        accountAddress: 'stored-account',
        createdAt: 1,
        lastValidBlockHeight: 300,
        network: 'mainnet',
        signature: '5'.repeat(88),
        transactionBase64: 'AQID',
      },
    ]);

    await makeSolanaTransfer(solParams(), createClient({ blockHeights: [400] }), sendOptions(store));
    expect(store.records).toEqual([]);
  });

  it('forgets a transaction the node refused in preflight', async () => {
    const store = memoryPendingStore();
    const client = createClient({
      sendError: new SolanaRpcError('solana_rpc_error', 200, { code: -32002, message: 'Transaction simulation failed' }),
    });

    await expect(makeSolanaTransfer(solParams(), client, sendOptions(store))).rejects.toThrow('solana_simulation_failed');
    expect(store.records).toEqual([]);
  });

  it('honours a remote veto before touching keys', async () => {
    const client = createClient();
    const state = Object.assign(createState(), {
      sendKillSwitchService: { assertSendEnabled: vi.fn(async () => Promise.reject(new Error('solana_transfer_disabled'))) },
    }) as unknown as State;

    await expect(makeSolanaTransfer(solParams({ state }), client, sendOptions())).rejects.toThrow('solana_transfer_disabled');
    expect(state.keyringService.exportMnemonic).not.toHaveBeenCalled();
    expect(client.getLatestBlockhash).not.toHaveBeenCalled();
  });

  it('resolves pending records from signature status and block height', async () => {
    const record = (signature: string, lastValidBlockHeight: number): SolanaPendingSend => ({
      accountAddress: 'a',
      createdAt: 1,
      lastValidBlockHeight,
      network: 'mainnet',
      signature,
      transactionBase64: 'AQID',
    });
    const client = {
      getBlockHeight: vi.fn(async () => 200),
      getSignatureStatuses: vi.fn(async () => [{ confirmationStatus: 'finalized', err: null, slot: 1 }, null, null] as never),
      sendRawTransaction: vi.fn(async () => 'sig'),
    };
    const { resolved, unresolved } = await resolveSolanaPendingSends(
      [record('a'.repeat(88), 300), record('b'.repeat(88), 100), record('c'.repeat(88), 300)],
      client
    );

    expect(resolved.map(({ signature }) => signature[0])).toEqual(['a', 'b']);
    expect(unresolved.map(({ signature }) => signature[0])).toEqual(['c']);
  });
});

describe('Solana RPC endpoints and balances', () => {
  it('fails over across public mainnet RPC nodes', async () => {
    const urls: string[] = [];
    const fetchFn = vi.fn(async (url: string | URL, init?: RequestInit) => {
      urls.push(url.toString());

      if (url.toString().includes('api.mainnet-beta')) return new Response('rate limited', { status: 429 });

      const { id } = JSON.parse(init?.body as string);

      return new Response(JSON.stringify({ id, jsonrpc: '2.0', result: { context: { slot: 1 }, value: 42 } }));
    });
    const client = new SolanaRpcClient({ fetchFn });

    await expect(client.getBalance(recipient)).resolves.toBe(42);
    expect(urls).toEqual(['https://api.mainnet-beta.solana.com', 'https://solana-rpc.publicnode.com']);
    expect(client.rpcUrls.some((url) => url.includes('soramitsu'))).toBe(false);
  });

  it('accepts the null replacement blockhash real nodes return for a signed simulation', async () => {
    const fetchFn = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const { id } = JSON.parse(init?.body as string);

      return new Response(
        JSON.stringify({
          id,
          jsonrpc: '2.0',
          result: { context: { slot: 1 }, value: { accounts: null, err: null, logs: [], replacementBlockhash: null, unitsConsumed: 450 } },
        })
      );
    });

    await expect(
      new SolanaRpcClient({ fetchFn, rpcUrl: 'http://127.0.0.1:8899' }).simulateTransaction('AQID', {
        replaceRecentBlockhash: false,
        sigVerify: true,
      })
    ).resolves.toMatchObject({ value: { err: null, replacementBlockhash: undefined, unitsConsumed: 450 } });
  });

  it('does not fail over on a JSON-RPC application error', async () => {
    const fetchFn = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const { id } = JSON.parse(init?.body as string);

      return new Response(JSON.stringify({ error: { code: -32602, message: 'invalid param' }, id, jsonrpc: '2.0' }));
    });

    await expect(new SolanaRpcClient({ fetchFn }).getBalance(recipient)).rejects.toThrow('solana_rpc_error');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('reads SOL and token balances straight from JSON-RPC', async () => {
    const balances = createSolanaRpcBalanceClient({
      getBalance: vi.fn(async () => 1_500_000_000),
      getMultipleAccounts: vi.fn(async () => [
        {
          data: { parsed: { info: { decimals: 6, isInitialized: true, supply: '10' }, type: 'mint' } },
          executable: false,
          lamports: 1,
          owner: SPL_TOKEN_PROGRAM_ADDRESS,
        },
      ]),
      getTokenAccountsByOwner: vi.fn(async (_owner: string, programId: string) =>
        programId === SPL_TOKEN_PROGRAM_ADDRESS
          ? [
              {
                account: {
                  data: {
                    parsed: {
                      info: { mint: tokenMint, owner: solanaAddress, state: 'initialized', tokenAmount: { amount: '2500000', decimals: 6, uiAmountString: '2.5' } },
                      type: 'account',
                    },
                  },
                  executable: false,
                  lamports: 2_039_280,
                  owner: SPL_TOKEN_PROGRAM_ADDRESS,
                },
                pubkey: sourceTokenAccount,
              },
              {
                account: {
                  data: { parsed: { info: { mint: otherMint, owner: solanaAddress, state: 'initialized', tokenAmount: { amount: '0', decimals: 6 } }, type: 'account' } },
                  executable: false,
                  lamports: 2_039_280,
                  owner: SPL_TOKEN_PROGRAM_ADDRESS,
                },
                pubkey: recipientTokenAccount,
              },
            ]
          : []
      ),
    });
    const result = await balances.getBalances(solanaAddress);
    const metadata = await balances.getTokenMetadataBatch([tokenMint]);

    expect(result.native).toMatchObject({ lamports: '1500000000', uiAmountString: '1.5' });
    expect(result.tokens).toEqual([
      expect.objectContaining({ accountAddress: sourceTokenAccount, amount: '2500000', mint: tokenMint, program: 'spl-token', uiAmountString: '2.5' }),
    ]);
    expect(metadata.tokens[0]).toMatchObject({ decimals: 6, exists: true, extensions: [], program: 'spl-token' });
  });
});
