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
import {
  isConfirmedSolanaStatus,
  resolveSolanaPendingSends,
  type SolanaPendingSend,
} from '@extension-base/api/solana/pendingSends';
import {
  SolanaBroadcastError,
  SolanaRpcClient,
  SolanaRpcError,
  type SolanaSignatureQuery,
  type SolanaSignatureResolution,
  type SolanaSignatureStatus,
} from '@extension-base/services/solana-rpc-service';
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
  expiryProvingHosts = 2,
  fees = [0, 10_000, 20_000, 30_000],
  sendError,
  statuses = [{ confirmationStatus: 'confirmed', confirmations: 1, err: null, slot: 130 }],
}: {
  accounts?: Record<string, unknown>;
  balanceLamports?: number;
  blockHeights?: number[];
  expiryProvingHosts?: number;
  fees?: number[];
  sendError?: Error;
  statuses?: unknown[];
} = {}) {
  let statusIndex = 0;
  let heightIndex = 0;

  return {
    getAccountInfo: vi.fn(async (address: string) => (accounts[address] ?? null) as never),
    getBalance: vi.fn(async () => balanceLamports),
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
    // Honest nodes on `expiryProvingHosts` distinct hosts whose finalized height is `blockHeights` and whose lookups
    // follow `statuses`; the rule that turns those into a verdict is tested against the real client in
    // solana-signature-resolution.spec.ts.
    resolveSignatures: vi.fn(async (queries: readonly SolanaSignatureQuery[]) => {
      const finalizedHeight = blockHeights[Math.min(heightIndex++, blockHeights.length - 1)];

      return queries.map(({ lastValidBlockHeight }): SolanaSignatureResolution => {
        const status = statuses[Math.min(statusIndex++, statuses.length - 1)] as SolanaSignatureStatus | null;

        if (status) return isConfirmedSolanaStatus(status) ? { state: 'landed', status } : { state: 'pending' };

        return finalizedHeight > lastValidBlockHeight ? { provingHosts: expiryProvingHosts, state: 'expired' } : { state: 'pending' };
      });
    }),
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

  it('waits past a processed-only failure, which a fork switch can still undo', async () => {
    const store = memoryPendingStore();
    const client = createClient({
      statuses: [
        { confirmationStatus: 'processed', confirmations: 0, err: { InstructionError: [2, 'Custom'] }, slot: 1 },
        { confirmationStatus: 'confirmed', confirmations: 1, err: null, slot: 2 },
      ],
    });
    const params = solParams();

    await makeSolanaTransfer(params, client, sendOptions(store));

    expect(params.callback).toHaveBeenCalledWith({ status: true });
    expect(client.getSignatureStatuses).toHaveBeenCalledTimes(2);
    expect(store.records).toEqual([]);
  });

  it('keeps a processed-only failure pending when it never confirms', async () => {
    const store = memoryPendingStore();
    const client = createClient({
      statuses: [{ confirmationStatus: 'processed', confirmations: 0, err: { InstructionError: [2, 'Custom'] }, slot: 1 }],
    });

    await expect(makeSolanaTransfer(solParams(), client, sendOptions(store, 5_000))).rejects.toThrow(
      'solana_broadcast_ambiguous'
    );
    expect(store.records).toHaveLength(1);
  });

  it('reports a transfer that lands in the last valid block as confirmed', async () => {
    const store = memoryPendingStore();
    const client = createClient({
      blockHeights: [457],
      statuses: [null, null, null, { confirmationStatus: 'confirmed', confirmations: 1, err: null, slot: 4 }],
    });
    const params = solParams();

    await makeSolanaTransfer(params, client, sendOptions(store));

    expect(params.callback).toHaveBeenCalledWith({ status: true });
    expect(store.records).toEqual([]);
  });

  describe('when the settled record cannot be cleared', () => {
    const failingStore = () => {
      const store = memoryPendingStore();

      store.remove.mockRejectedValue(new Error('storage unavailable'));

      return store;
    };

    it('still reports a confirmed send as confirmed, and keeps the record for the next send to resolve', async () => {
      const store = failingStore();
      const params = solParams();

      await makeSolanaTransfer(params, createClient(), sendOptions(store));

      expect(params.callback).toHaveBeenCalledWith({ status: true });
      expect(store.records).toHaveLength(1);
    });

    it('still reports an expired blockhash as expired', async () => {
      const store = failingStore();
      const client = createClient({ blockHeights: [457], statuses: [null] });

      await expect(makeSolanaTransfer(solParams(), client, sendOptions(store))).rejects.toThrow('solana_transaction_expired');
      expect(store.records).toHaveLength(1);
    });

    it('still reports a transaction the node refused as refused', async () => {
      const store = failingStore();
      const client = createClient({
        sendError: new SolanaBroadcastError(
          'solana_broadcast_rejected',
          false,
          new SolanaRpcError('solana_rpc_error', 200, { code: -32002, message: 'Transaction simulation failed' })
        ),
      });

      await expect(makeSolanaTransfer(solParams(), client, sendOptions(store))).rejects.toThrow('solana_simulation_failed');
    });
  });

  it('reports an expired blockhash as nothing sent, so a retry is safe', async () => {
    const store = memoryPendingStore();
    const client = createClient({ blockHeights: [457], statuses: [null] });

    await expect(makeSolanaTransfer(solParams(), client, sendOptions(store))).rejects.toThrow('solana_transaction_expired');
    expect(store.records).toEqual([]);
    // Judged against the blockhash's own last valid height, as quoted.
    expect(client.resolveSignatures).toHaveBeenCalledWith([{ lastValidBlockHeight: 456, signature: expect.any(String) }]);
  });

  it('keeps the send open when only one host proves expiry, then releases it with a warning and sends nothing', async () => {
    const store = memoryPendingStore();
    const lone = createClient({ blockHeights: [457], expiryProvingHosts: 1, statuses: [null] });

    await expect(makeSolanaTransfer(solParams(), lone, sendOptions(store))).rejects.toThrow('solana_broadcast_ambiguous');
    expect(store.records).toHaveLength(1);

    // The next send finds the same lone proof: the record is released, but this send stops so the user checks first.
    const next = createClient({ blockHeights: [457], expiryProvingHosts: 1, statuses: [null] });

    await expect(makeSolanaTransfer(solParams({ amount: '0.1' }), next, sendOptions(store))).rejects.toThrow(
      'solana_previous_send_unverified'
    );
    expect(store.records).toEqual([]);
    expect(next.getLatestBlockhash).not.toHaveBeenCalled();
    expect(next.sendRawTransaction).not.toHaveBeenCalled();

    // The send after that goes through.
    const after = createClient();

    await makeSolanaTransfer(solParams({ amount: '0.1' }), after, sendOptions(store));
    expect(after.sendRawTransaction).toHaveBeenCalledOnce();
  });

  it('reports a transfer the network ran and failed as failed, not as sent', async () => {
    const store = memoryPendingStore();
    const client = createClient({
      blockHeights: [100],
      statuses: [
        null,
        null,
        null,
        { confirmationStatus: 'confirmed', confirmations: 1, err: { InstructionError: [0, 'Custom'] }, slot: 4 },
      ],
    });
    const params = solParams();

    await expect(makeSolanaTransfer(params, client, sendOptions(store))).rejects.toThrow('solana_transaction_failed');
    expect(params.callback).not.toHaveBeenCalled();
    expect(store.records).toEqual([]);
  });

  describe('against the real signature resolution', () => {
    // Epoch info and the signature lookup answered by one node, through the real client.
    const withNode = (
      answer: { blockHeight: number; lookup: { slot: number; value: unknown[] }; slot: number },
      rpcUrls = ['https://resolution.example', 'https://second-resolution.example']
    ) => {
      const fetchFn = vi.fn(async (_url: string | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body));
        const result =
          body.method === 'getEpochInfo'
            ? { absoluteSlot: answer.slot, blockHeight: answer.blockHeight, epoch: 1, slotIndex: 1, slotsInEpoch: 432_000 }
            : { context: { slot: answer.lookup.slot }, value: answer.lookup.value };

        return new Response(JSON.stringify({ id: body.id, jsonrpc: '2.0', result }), { status: 200 });
      });
      const rpc = new SolanaRpcClient({ fetchFn: fetchFn as never, rpcUrls });
      // Plain status polls say "no trace"; only the expiry check reaches the node.
      const client = { ...createClient({ statuses: [null] }), resolveSignatures: rpc.resolveSignatures.bind(rpc) };

      return { client, fetchFn };
    };

    it('reports a send expired once two hosts finalized past the last valid block and still have no trace', async () => {
      const store = memoryPendingStore();
      const { client } = withNode({ blockHeight: 457, lookup: { slot: 1_001, value: [null] }, slot: 1_000 });

      await expect(makeSolanaTransfer(solParams(), client, sendOptions(store))).rejects.toThrow('solana_transaction_expired');
      expect(store.records).toEqual([]);
    });

    it('keeps the send open when only one host could prove expiry', async () => {
      const store = memoryPendingStore();
      const { client } = withNode({ blockHeight: 457, lookup: { slot: 1_001, value: [null] }, slot: 1_000 }, [
        'https://resolution.example',
      ]);

      await expect(makeSolanaTransfer(solParams(), client, sendOptions(store))).rejects.toThrow('solana_broadcast_ambiguous');
      expect(store.records).toHaveLength(1);
    });

    it('keeps the send open when the lookup came from a backend older than the finalized progress', async () => {
      const store = memoryPendingStore();
      const { client } = withNode({ blockHeight: 457, lookup: { slot: 999, value: [null] }, slot: 1_000 });

      await expect(makeSolanaTransfer(solParams(), client, sendOptions(store))).rejects.toThrow('solana_broadcast_ambiguous');
      expect(store.records).toHaveLength(1);
    });

    it('does not release the record of an earlier send while the node has not finalized past it', async () => {
      const record: SolanaPendingSend = { accountAddress: 'stored-account', createdAt: 1, lastValidBlockHeight: 456,
        network: 'mainnet', signature: '5'.repeat(88), transactionBase64: 'AQID' };
      const { client } = withNode({ blockHeight: 456, lookup: { slot: 1_001, value: [null] }, slot: 1_000 });
      const { resolved, unresolved } = await resolveSolanaPendingSends([record], client, undefined, false);

      expect(resolved).toEqual([]);
      expect(unresolved).toEqual([record]);
    });

    it('releases the record of an earlier send once two hosts prove it expired', async () => {
      const record: SolanaPendingSend = { accountAddress: 'stored-account', createdAt: 1, lastValidBlockHeight: 456,
        network: 'mainnet', signature: '5'.repeat(88), transactionBase64: 'AQID' };
      const { client } = withNode({ blockHeight: 457, lookup: { slot: 1_001, value: [null] }, slot: 1_000 });
      const outcome = await resolveSolanaPendingSends([record], client, undefined, false, () => 1_000);

      expect(outcome).toEqual({ resolved: [record], unresolved: [], unverified: [] });
    });

    it.each<[string, string[], number]>([
      ['only one host proves it expired', ['https://resolution.example'], 1_000],
      ['two spellings of one host prove it', ['https://resolution.example/a', 'https://resolution.example./b'], 1_000],
      ['the record is older than six hours', ['https://resolution.example', 'https://second-resolution.example'], 1 + 6 * 60 * 60_000],
      ['the record is dated after the clock', ['https://resolution.example', 'https://second-resolution.example'], 0],
    ])('marks an earlier send unverified, not expired, when %s', async (_case, rpcUrls, judgedAt) => {
      const record: SolanaPendingSend = { accountAddress: 'stored-account', createdAt: 1, lastValidBlockHeight: 456,
        network: 'mainnet', signature: '5'.repeat(88), transactionBase64: 'AQID' };
      const { client } = withNode({ blockHeight: 457, lookup: { slot: 1_001, value: [null] }, slot: 1_000 }, rpcUrls);
      const outcome = await resolveSolanaPendingSends([record], client, undefined, false, () => judgedAt);

      expect(outcome).toEqual({ resolved: [], unresolved: [], unverified: [record] });
    });
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


  it.each(['current', 'legacy'])('retains the unresolved Solana barrier under another primary account for %s records', async recordKind => {
    const store = memoryPendingStore();
    const first = createClient({ statuses: [null], blockHeights: [100] });
    await expect(makeSolanaTransfer(solParams(), first, sendOptions(store, 1_000))).rejects.toThrow('solana_broadcast_ambiguous');
    if (recordKind === 'legacy') delete (store.records[0] as SolanaPendingSend & { senderAddress?: string }).senderAddress;
    const state = createState();
    const [original] = state.keyringService.getAllAccounts();
    vi.mocked(state.keyringService.getAllAccounts).mockReturnValue([{ ...original, address: 'public-alias' }] as never);
    const retry = createClient({ statuses: [null], blockHeights: [100] });
    await expect(makeSolanaTransfer(solParams({ state, from: 'public-alias', amount: '0.1' }), retry, sendOptions(store)))
      .rejects.toThrow('solana_previous_send_pending');
    expect(retry.getLatestBlockhash).not.toHaveBeenCalled();
    expect(retry.sendRawTransaction).toHaveBeenCalledOnce();
    expect(retry.sendRawTransaction.mock.calls[0][0]).toBe(store.records[0].transactionBase64);
    expect(store.records).toHaveLength(1);
  });

  it('does not authorize unverifiable legacy bytes using the current account label', async () => {
    const store = memoryPendingStore();
    const first = createClient({ statuses: [null], blockHeights: [100] });
    await expect(makeSolanaTransfer(solParams(), first, sendOptions(store, 1_000))).rejects.toThrow('solana_broadcast_ambiguous');
    delete store.records[0].senderAddress;
    store.records[0].signature = 'different public signature';
    const earlier = structuredClone(store.records);
    const retry = createClient({ statuses: [null], blockHeights: [100] });
    await expect(makeSolanaTransfer(solParams(), retry, sendOptions(store))).rejects.toThrow('solana_previous_send_pending');
    expect(retry.sendRawTransaction).not.toHaveBeenCalled();
    expect(retry.getLatestBlockhash).not.toHaveBeenCalled();
    expect(store.records).toEqual(earlier);
  });

  it('keeps unknown legacy ownership read-only until the old bytes have a proven outcome', async () => {
    const record: SolanaPendingSend = { accountAddress: 'removed primary', createdAt: 0, network: 'mainnet',
      lastValidBlockHeight: 456, signature: 'unresolved public signature', transactionBase64: 'AQID' };
    const store = memoryPendingStore([record]);
    const unavailable = createClient({ statuses: [null], blockHeights: [100] });
    await expect(makeSolanaTransfer(solParams(), unavailable, sendOptions(store))).rejects.toThrow('solana_previous_send_pending');
    expect(unavailable.sendRawTransaction).not.toHaveBeenCalled();
    expect(unavailable.getLatestBlockhash).not.toHaveBeenCalled();
    expect(store.records).toEqual([record]);
    const resolved = createClient({ statuses: [null, { confirmationStatus: 'confirmed', confirmations: 1, err: null, slot: 130 }], blockHeights: [500] });
    await makeSolanaTransfer(solParams(), resolved, sendOptions(store));
    expect(resolved.sendRawTransaction).toHaveBeenCalledOnce();
    expect(resolved.sendRawTransaction.mock.calls[0][0]).not.toBe(record.transactionBase64);
    expect(store.records).toEqual([]);
  });

  it('refuses overlapping Solana sends before either can bypass the pending record check', async () => {
    const state = createState();
    const store = memoryPendingStore();
    const client = createClient();
    let release!: () => void;
    const waiting = new Promise<void>(resolve => { release = resolve; });
    const fee = client.getFeeForMessage.getMockImplementation()!;
    client.getFeeForMessage.mockImplementation(async message => { await waiting; return fee(message); });
    const first = makeSolanaTransfer(solParams({ state }), client, sendOptions(store));
    await vi.waitFor(() => expect(client.getFeeForMessage).toHaveBeenCalledOnce());
    const second = makeSolanaTransfer(solParams({ state, amount: '0.1' }), client, sendOptions(store));
    const checked = expect(second).rejects.toThrow('solana_previous_send_pending');
    release();
    await Promise.all([first, checked]);
    expect(client.sendRawTransaction).toHaveBeenCalledOnce();
  });

  it.each(['pending read', 'status lookup', 'failed lookup'])('does not rebroadcast an earlier Solana send after reset during %s', async boundary => {
    const state = createState();
    const record: SolanaPendingSend = { accountAddress: 'stored-account', createdAt: 1, network: 'mainnet',
      lastValidBlockHeight: 456, signature: 'public previous signature', transactionBase64: 'AQID' };
    const store = memoryPendingStore([record]);
    const client = createClient({ statuses: [null] });
    const reset = () => Object.assign(state.keyringService, { walletResetRevision: 1 });
    if (boundary === 'pending read') store.list.mockImplementation(async () => { reset(); return [record]; });
    else client.resolveSignatures.mockImplementation(async () => {
      reset();
      if (boundary === 'failed lookup') throw new Error('public offline');
      return [{ state: 'pending' }] as never;
    });
    await expect(makeSolanaTransfer(solParams({ state }), client, sendOptions(store)))
      .rejects.toThrow('Wallet changed during transfer');
    expect(client.sendRawTransaction).not.toHaveBeenCalled();
    expect(client.getLatestBlockhash).not.toHaveBeenCalled();
    expect(store.records).toEqual([record]);
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
    }, expect.any(Function));
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

  it('lets a new send through once two hosts prove the earlier one expired', async () => {
    const store = memoryPendingStore([
      {
        accountAddress: 'stored-account',
        createdAt: 0,
        lastValidBlockHeight: 300,
        network: 'mainnet',
        signature: '5'.repeat(88),
        transactionBase64: 'AQID',
      },
    ]);
    const client = createClient({
      blockHeights: [400],
      statuses: [null, { confirmationStatus: 'confirmed', confirmations: 1, err: null, slot: 130 }],
    });

    await makeSolanaTransfer(solParams(), client, sendOptions(store));
    expect(client.sendRawTransaction).toHaveBeenCalledOnce();
    expect(store.records).toEqual([]);
  });

  it('forgets a transaction the node refused in preflight', async () => {
    const store = memoryPendingStore();
    const client = createClient({
      sendError: new SolanaBroadcastError(
        'solana_broadcast_rejected',
        false,
        new SolanaRpcError('solana_rpc_error', 200, { code: -32002, message: 'Transaction simulation failed' })
      ),
    });

    await expect(makeSolanaTransfer(solParams(), client, sendOptions(store))).rejects.toThrow('solana_simulation_failed');
    expect(store.records).toEqual([]);
    expect(client.getSignatureStatuses).not.toHaveBeenCalled();
  });

  it('keeps the record and reports an unknown outcome when a gateway failed after it may have relayed', async () => {
    const store = memoryPendingStore();
    const client = createClient({
      sendError: new SolanaBroadcastError(
        'solana_broadcast_ambiguous',
        true,
        new SolanaRpcError('solana_rpc_error', 200, { code: -32603, message: 'Internal error' })
      ),
      statuses: [null],
      blockHeights: [100],
    });

    await expect(makeSolanaTransfer(solParams(), client, sendOptions(store, 1_000))).rejects.toThrow(
      'solana_broadcast_ambiguous'
    );
    expect(store.records).toHaveLength(1);
  });

  it('keeps polling when an error does not prove the transaction was refused', async () => {
    const store = memoryPendingStore();
    const client = createClient({
      sendError: new SolanaRpcError('solana_rpc_error', 200, { code: -32002, message: 'Transaction simulation failed' }),
    });
    const params = solParams();

    await makeSolanaTransfer(params, client, sendOptions(store));

    expect(client.getSignatureStatuses).toHaveBeenCalled();
    expect(params.callback).toHaveBeenCalledWith({ status: true });
  });

  describe('through real RPC failover after a timed-out first post', () => {
    const relayedThenRefused = (refusal: { code: number; data?: unknown; message: string }, base = createClient()) => {
      const posts: Array<{ skipPreflight: unknown; url: string }> = [];
      const fetchFn = async (url: string | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body));

        if (body.method !== 'sendTransaction') throw new Error(`unexpected ${body.method}`);
        posts.push({ skipPreflight: body.params[1].skipPreflight, url: String(url) });
        // The first node relays the transaction, but its answer never arrives.
        if (String(url).startsWith('https://slow.example')) return new Promise<Response>(() => {});

        return new Response(JSON.stringify({ error: refusal, id: body.id, jsonrpc: '2.0' }), { status: 200 });
      };
      const rpc = new SolanaRpcClient({
        fetchFn: fetchFn as never,
        requestTimeoutMs: 5,
        rpcUrls: ['https://slow.example', 'https://second.example'],
      });

      return { client: { ...base, sendRawTransaction: rpc.sendRawTransaction.bind(rpc) }, base, posts };
    };

    it('polls the signature when the next node says the transaction was already processed', async () => {
      const { base, client, posts } = relayedThenRefused({
        code: -32002,
        data: { err: 'AlreadyProcessed', logs: [] },
        message: 'Transaction simulation failed: This transaction has already been processed',
      });
      const store = memoryPendingStore();
      const params = solParams();

      await makeSolanaTransfer(params, client, sendOptions(store));

      expect(posts.slice(0, 2).map(({ url }) => url)).toEqual(['https://slow.example', 'https://second.example']);
      expect(base.getSignatureStatuses).toHaveBeenCalled();
      expect(params.callback).toHaveBeenCalledWith({ status: true });
      expect(store.records).toEqual([]);
    });

    it('keeps the record and polls when a lagging node refuses the transaction', async () => {
      // Never confirmed while the user waits, and the blockhash is still valid.
      const { client, posts } = relayedThenRefused(
        { code: -32002, message: 'Transaction simulation failed: Blockhash not found' },
        createClient({ blockHeights: [100], statuses: [null] })
      );
      const store = memoryPendingStore();

      await expect(makeSolanaTransfer(solParams(), client, sendOptions(store, 5_000))).rejects.toThrow(
        'solana_broadcast_ambiguous'
      );
      // The failover post skipped preflight; the transfer was never called failed.
      expect(posts[1]).toMatchObject({ skipPreflight: true, url: 'https://second.example' });
      expect(store.records).toHaveLength(1);
      await expect(makeSolanaTransfer(solParams(), createClient({ blockHeights: [100], statuses: [null] }), sendOptions(store))).rejects.toThrow(
        'solana_previous_send_pending'
      );
    });
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

  describe('pending records', () => {
    const record = (signature: string, lastValidBlockHeight: number): SolanaPendingSend => ({
      accountAddress: 'a',
      createdAt: 1,
      lastValidBlockHeight,
      network: 'mainnet',
      signature,
      transactionBase64: 'AQID',
    });
    const landed = (confirmationStatus: SolanaSignatureStatus['confirmationStatus']): SolanaSignatureResolution => ({
      state: 'landed',
      status: { confirmationStatus, confirmations: null, err: null, slot: 1 },
    });

    it('resolves the records the network settled and keeps the others in flight', async () => {
      const client = {
        resolveSignatures: vi.fn(async () => [landed('finalized'), { provingHosts: 2, state: 'expired' }, { state: 'pending' }] as never),
        sendRawTransaction: vi.fn(async () => 'sig'),
      };
      const records = [record('a'.repeat(88), 300), record('b'.repeat(88), 100), record('c'.repeat(88), 300)];
      const { resolved, unresolved, unverified } = await resolveSolanaPendingSends(records, client, undefined, true, () => 1_000);

      expect(client.resolveSignatures).toHaveBeenCalledWith([
        { lastValidBlockHeight: 300, signature: 'a'.repeat(88) },
        { lastValidBlockHeight: 100, signature: 'b'.repeat(88) },
        { lastValidBlockHeight: 300, signature: 'c'.repeat(88) },
      ]);
      expect(resolved.map(({ signature }) => signature[0])).toEqual(['a', 'b']);
      expect(unresolved.map(({ signature }) => signature[0])).toEqual(['c']);
      expect(unverified).toEqual([]);
      // Only the record still in flight is rebroadcast, with the same bytes.
      expect(client.sendRawTransaction).toHaveBeenCalledOnce();
      expect(client.sendRawTransaction).toHaveBeenCalledWith('AQID', { maxRetries: 0, skipPreflight: true }, undefined);
    });

    it('marks an expiry with too little proof unverified, and rebroadcasts nothing for it', async () => {
      const client = {
        resolveSignatures: vi.fn(async () => [
          { provingHosts: 1, state: 'expired' },
          { provingHosts: 2, state: 'expired' },
          { provingHosts: 2, state: 'expired' },
        ] as never),
        sendRawTransaction: vi.fn(async () => 'sig'),
      };
      const young = record('a'.repeat(88), 100);
      const old = { ...record('b'.repeat(88), 100), createdAt: 1_000 - 6 * 60 * 60_000 };
      const legacy = { ...record('c'.repeat(88), 100) } as Partial<SolanaPendingSend>;

      delete legacy.createdAt;

      const outcome = await resolveSolanaPendingSends([young, old, legacy as SolanaPendingSend], client, undefined, true, () => 1_000);

      // One host, a record older than six hours, and a record with no time are each unverified.
      expect(outcome).toEqual({ resolved: [], unresolved: [], unverified: [young, old, legacy] });
      expect(client.sendRawTransaction).not.toHaveBeenCalled();
    });

    it('keeps every record in flight, and rebroadcasts nothing, when no node could answer', async () => {
      const client = {
        resolveSignatures: vi.fn(async () => {
          throw new SolanaRpcError('solana_rpc_unavailable');
        }),
        sendRawTransaction: vi.fn(async () => 'sig'),
      };
      const records = [record('a'.repeat(88), 300), record('b'.repeat(88), 100)];
      const { resolved, unresolved } = await resolveSolanaPendingSends(records, client);

      expect(resolved).toEqual([]);
      expect(unresolved).toEqual(records);
      expect(client.sendRawTransaction).not.toHaveBeenCalled();
    });

    it('does not rebroadcast when asked only to read', async () => {
      const client = {
        resolveSignatures: vi.fn(async () => [{ state: 'pending' }] as never),
        sendRawTransaction: vi.fn(async () => 'sig'),
      };
      const { unresolved } = await resolveSolanaPendingSends([record('a'.repeat(88), 300)], client, undefined, false);

      expect(unresolved).toHaveLength(1);
      expect(client.sendRawTransaction).not.toHaveBeenCalled();
    });
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
