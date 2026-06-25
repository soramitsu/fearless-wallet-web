import { base58Decode } from '@polkadot/util-crypto';
import {
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  SPL_TOKEN_PROGRAM_ADDRESS,
  SYSTEM_PROGRAM_ADDRESS,
  createSolanaSplTokenTransferTransaction,
  createSolanaSystemTransferTransaction,
  deriveAssociatedTokenAddress,
  estimateSolanaTransferFee,
  getSolanaNetworkKind,
  getSolanaRpcUrl,
  lamportsToSolString,
  makeSolanaTransfer,
  normalizeSolanaAddress,
  prepareSolanaTransferForTest,
  resolveSolanaTransferSource,
  solanaAmountToLamports,
  solanaTokenAmountToBaseUnits,
  type SolanaTransferClient,
} from '@extension-base/api/solana/transfer';
import vectors from '../../docs/universal-wallet-v2-vectors.json';
import type State from '@extension-base/background/handlers/State';
import type { NetworkJson } from '@extension-base/types';
import { WalletEcosystem } from '@/interfaces';
import { getSolanaSerializedMessageBase64, parseSolanaSerializedTransaction } from '@/util/solanaTransaction';

const mnemonic = vectors.vectors[0].mnemonic;
const solanaAddress = vectors.vectors[0].expected.solana.address;
const recipient = vectors.vectors[1].expected.solana.address;
const otherMnemonic = vectors.vectors[1].mnemonic;
const storedAccount = 'stored-substrate-account';
const blockhash = '7GjNiPun3AzEazTZoFEjZgcBMeuaXdpjHq2raZTmTrfs';
const tokenMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const sourceTokenAccount = '5N3f1tj9v1vc5TUZ8S7mCAnVmjVKrfnzXWhxLaxyZAgt';
const recipientTokenAccount = 'GSpMV7g3LwYkMTXbaDKfX7H26kwFGS5qcA9pEGD9TbFa';

function standardSolanaTokenBalance(overrides: Record<string, unknown> = {}) {
  return {
    address: storedAccount,
    free: '100',
    frozen: '0',
    icon: 'solana',
    id: tokenMint,
    isNative: false,
    isUtility: false,
    locked: '0',
    mainNetwork: 'Solana',
    name: 'Solana',
    precision: 6,
    relayChain: 'solana',
    reserved: '0',
    solanaTokenAccountAddress: sourceTokenAccount,
    solanaTokenExtensions: [],
    solanaTokenMint: tokenMint,
    solanaTokenProgram: 'spl-token',
    solanaTokenProgramId: SPL_TOKEN_PROGRAM_ADDRESS,
    solanaTokenState: 'initialized',
    solanaTokenTransferFeeConfig: null,
    solanaTokenTransferHook: null,
    state: 'ready',
    symbol: 'USDC',
    total: '100',
    transferable: '100',
    type: 'solana',
    ...overrides,
  };
}

function solanaNetwork(name = 'Solana', chainId = 'solana:mainnet', overrides: Partial<NetworkJson> = {}): NetworkJson {
  return {
    active: true,
    addressPrefix: 0,
    assets: [{ id: 'SOL', isNative: true, isUtility: true, precision: 9, symbol: 'SOL' }],
    chain: name,
    chainId,
    currentProvider: 'rpc',
    customNodes: [],
    disabled: false,
    ecosystem: 'solana',
    favorite: [],
    genesisHash: `0x${chainId}`,
    icon: 'solana',
    key: name,
    name,
    nodes: [{ name: 'node-rpc', url: 'https://node.solana.example' }],
    options: chainId.includes('devnet') ? ['testnet'] : undefined,
    providers: { rpc: 'https://provider.solana.example' },
    ss58Format: 0,
    types: { name, url: '' },
    ...overrides,
  } as unknown as NetworkJson;
}

function createState({
  seed = mnemonic,
  sourceAddress = solanaAddress,
  tokenBalance,
  networks = {
    Solana: solanaNetwork(),
    'Solana Devnet': solanaNetwork('Solana Devnet', 'solana:devnet', {
      currentProvider: '',
      providers: {},
    }),
  },
}: {
  networks?: Record<string, NetworkJson>;
  seed?: string;
  sourceAddress?: string;
  tokenBalance?: ReturnType<typeof standardSolanaTokenBalance>;
} = {}) {
  return {
    balanceService: {
      fetchBalance: vi.fn(async () => []),
      getTokenBalance: vi.fn((_address: string, assetId: string, relayChain?: string) => {
        if (!tokenBalance || assetId !== tokenBalance.id || relayChain !== 'solana') throw new Error('token_not_found');

        return {
          balances: [tokenBalance],
          groupId: tokenBalance.id,
          relayChain: 'solana',
        };
      }),
    },
    keyringService: {
      exportMnemonic: vi.fn(() => ({ seed })),
      getAllAccounts: vi.fn(() => [
        {
          address: storedAccount,
          meta: {
            solanaAddress: sourceAddress,
            walletEcosystem: WalletEcosystem.Substrate,
          },
        },
      ]),
    },
    networkService: {
      networkMap: networks,
    },
  } as unknown as State;
}

function createClient({
  feeLamports = 5000,
  sendSignature,
  simulationError = null,
}: {
  feeLamports?: number | null;
  sendSignature?: string;
  simulationError?: unknown;
} = {}): SolanaTransferClient {
  return {
    getFeeForMessage: vi.fn(async () => ({ context: { slot: 124 }, value: feeLamports })),
    getLatestBlockhash: vi.fn(async () => ({
      context: { slot: 123 },
      value: { blockhash, lastValidBlockHeight: 456 },
    })),
    sendRawTransaction: vi.fn(async () => sendSignature ?? ''),
    simulateTransaction: vi.fn(async () => ({
      context: { slot: 125 },
      value: {
        err: simulationError,
        logs: [],
      },
    })),
  };
}

function transferParams(state = createState()) {
  return {
    amount: '1.25',
    assetId: 'SOL',
    from: storedAccount,
    networkKey: 'Solana',
    state,
    to: recipient,
  };
}

function tokenTransferParams(state = createState({ tokenBalance: standardSolanaTokenBalance() })) {
  return {
    amount: '12.345678',
    assetId: tokenMint,
    from: storedAccount,
    networkKey: 'Solana',
    state,
    to: recipient,
  };
}

function parseCompiledInstructions(transaction: Uint8Array) {
  const parsed = parseSolanaSerializedTransaction(transaction);
  const message = parsed.messageBytes;
  let offset = parsed.version === 0 ? 1 : 0;

  offset += 3;

  const accountCount = readCompactU16ForTest(message, offset);

  offset = accountCount.offset + accountCount.value * 32 + 32;

  const instructionCount = readCompactU16ForTest(message, offset);
  const instructions: { accountIndexes: number[]; data: number[]; programIndex: number }[] = [];

  offset = instructionCount.offset;

  for (let index = 0; index < instructionCount.value; index += 1) {
    const programIndex = message[offset];
    const accountIndexCount = readCompactU16ForTest(message, offset + 1);

    offset = accountIndexCount.offset;

    const accountIndexes = [...message.slice(offset, offset + accountIndexCount.value)];

    offset += accountIndexCount.value;

    const dataLength = readCompactU16ForTest(message, offset);

    offset = dataLength.offset;

    const data = [...message.slice(offset, offset + dataLength.value)];

    offset += dataLength.value;
    instructions.push({ accountIndexes, data, programIndex });
  }

  return { instructions, parsed };
}

function readCompactU16ForTest(bytes: Uint8Array, offset: number): { offset: number; value: number } {
  let value = 0;
  let shift = 0;

  for (let index = 0; index < 3; index += 1) {
    const byte = bytes[offset];

    offset += 1;
    value |= (byte & 0x7f) << shift;

    if ((byte & 0x80) === 0) return { offset, value };

    shift += 7;
  }

  throw new Error('invalid_compact_u16');
}

describe('background Solana transfer adapter', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('normalizes SOL amounts without floating point loss and rejects unsafe input', () => {
    expect(solanaAmountToLamports('0.000000001')).toBe(1n);
    expect(solanaAmountToLamports('1.23456789')).toBe(1_234_567_890n);
    expect(solanaAmountToLamports('10')).toBe(10_000_000_000n);
    expect(lamportsToSolString(1_234_567_890n)).toBe('1.23456789');
    expect(lamportsToSolString(5000n)).toBe('0.000005');

    expect(() => solanaAmountToLamports('0')).toThrow('invalid_solana_amount');
    expect(() => solanaAmountToLamports(' 1')).toThrow('invalid_solana_amount');
    expect(() => solanaAmountToLamports('1e3')).toThrow('invalid_solana_amount');
    expect(() => solanaAmountToLamports('0.0000000001')).toThrow('invalid_solana_amount');
    expect(() => solanaAmountToLamports('18446744074')).toThrow('invalid_solana_amount');
  });

  it('normalizes SPL token amounts and derives associated token accounts deterministically', () => {
    expect(solanaTokenAmountToBaseUnits('12.345678', 6)).toBe(12_345_678n);
    expect(solanaTokenAmountToBaseUnits('1', 0)).toBe(1n);
    expect(solanaTokenAmountToBaseUnits('18446744073709.551615', 6)).toBe(18_446_744_073_709_551_615n);
    expect(deriveAssociatedTokenAddress({ mint: tokenMint, owner: solanaAddress })).toBe(sourceTokenAccount);
    expect(deriveAssociatedTokenAddress({ mint: tokenMint, owner: recipient })).toBe(recipientTokenAccount);

    expect(() => solanaTokenAmountToBaseUnits('0', 6)).toThrow('invalid_solana_amount');
    expect(() => solanaTokenAmountToBaseUnits('1.0000001', 6)).toThrow('invalid_solana_amount');
    expect(() => solanaTokenAmountToBaseUnits('1.1', 0)).toThrow('invalid_solana_amount');
    expect(() => solanaTokenAmountToBaseUnits('18446744073709.551616', 6)).toThrow('invalid_solana_amount');
  });

  it('detects Solana network kind and uses selected RPC providers before defaults', () => {
    const mainnet = solanaNetwork();
    const devnet = solanaNetwork('Solana Devnet', 'solana:devnet', {
      currentProvider: '',
      providers: {},
    });
    const custom = solanaNetwork('Solana Custom', 'solana:mainnet', {
      currentProvider: 'user',
      customProviders: { user: 'https://custom.solana.example' },
      providers: {},
    });

    expect(getSolanaNetworkKind(mainnet)).toBe('mainnet');
    expect(getSolanaNetworkKind(devnet)).toBe('devnet');
    expect(getSolanaRpcUrl(mainnet)).toBe('https://provider.solana.example');
    expect(getSolanaRpcUrl(devnet)).toBe('https://node.solana.example');
    expect(getSolanaRpcUrl(custom)).toBe('https://custom.solana.example');
    expect(() => getSolanaNetworkKind({ ecosystem: 'substrate' } as NetworkJson)).toThrow('unsupported_solana_network');
  });

  it('builds a canonical legacy SystemProgram transfer transaction', () => {
    const transaction = createSolanaSystemTransferTransaction({
      from: solanaAddress,
      lamports: 1_250_000_000n,
      recentBlockhash: blockhash,
      to: recipient,
    });
    const parsed = parseSolanaSerializedTransaction(transaction);

    expect(parsed.version).toBe('legacy');
    expect(parsed.requiredSignatures).toBe(1);
    expect(parsed.accountKeys).toEqual([solanaAddress, recipient, SYSTEM_PROGRAM_ADDRESS]);
    expect(parsed.recentBlockhash).toBe(blockhash);
    expect(parsed.instructionCount).toBe(1);
    expect(parsed.readonlyUnsignedAccounts).toBe(1);
    expect(getSolanaSerializedMessageBase64(transaction)).toMatch(/^[A-Za-z0-9+/]+={0,2}$/u);
    expect(base58Decode(parsed.accountKeys[0])).toHaveLength(32);
  });

  it('builds a standard SPL Token transfer with idempotent recipient ATA creation', () => {
    const transaction = createSolanaSplTokenTransferTransaction({
      amount: 12_345_678n,
      decimals: 6,
      from: solanaAddress,
      mint: tokenMint,
      recentBlockhash: blockhash,
      sourceTokenAccount,
      toOwner: recipient,
      tokenProgramId: SPL_TOKEN_PROGRAM_ADDRESS,
    });
    const { instructions, parsed } = parseCompiledInstructions(transaction);

    expect(parsed.version).toBe('legacy');
    expect(parsed.requiredSignatures).toBe(1);
    expect(parsed.readonlySignedAccounts).toBe(0);
    expect(parsed.readonlyUnsignedAccounts).toBe(5);
    expect(parsed.accountKeys).toEqual([
      solanaAddress,
      recipientTokenAccount,
      sourceTokenAccount,
      recipient,
      tokenMint,
      SYSTEM_PROGRAM_ADDRESS,
      SPL_TOKEN_PROGRAM_ADDRESS,
      ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
    ]);
    expect(parsed.instructionCount).toBe(2);
    expect(instructions[0]).toEqual({
      accountIndexes: [0, 1, 3, 4, 5, 6],
      data: [1],
      programIndex: 7,
    });
    expect(instructions[1]).toEqual({
      accountIndexes: [2, 4, 1, 0],
      data: [12, 78, 97, 188, 0, 0, 0, 0, 0, 6],
      programIndex: 6,
    });
  });

  it('resolves the stored universal-wallet Solana source and rejects unsafe source states', () => {
    const state = createState();
    const source = resolveSolanaTransferSource(state, solanaAddress);

    expect(source).toMatchObject({
      accountAddress: storedAccount,
      mnemonicOrSeed: mnemonic,
      solanaAddress,
      walletEcosystem: WalletEcosystem.Substrate,
    });
    expect(state.keyringService.exportMnemonic).toHaveBeenCalledWith({
      address: storedAccount,
      walletEcosystem: WalletEcosystem.Substrate,
    });

    expect(() => normalizeSolanaAddress(`${solanaAddress} `)).toThrow('invalid_solana_address');
    expect(() => normalizeSolanaAddress('1111111111111111111111111111111')).toThrow('invalid_solana_address');
    expect(() => resolveSolanaTransferSource(createState(), 'missing')).toThrow('solana_account_not_found');
    expect(() => resolveSolanaTransferSource(createState({ seed: '' }), storedAccount)).toThrow(
      'solana_mnemonic_unavailable'
    );
    expect(() => resolveSolanaTransferSource(createState({ seed: otherMnemonic }), storedAccount)).toThrow(
      'invalid_solana_source_address'
    );
  });

  it('estimates SOL transfer fees through configured Solana RPC', async () => {
    const client = createClient();

    await expect(estimateSolanaTransferFee(transferParams(), client)).resolves.toBe('0.000005');
    expect(client.getLatestBlockhash).toHaveBeenCalledWith('confirmed');
    expect(client.getFeeForMessage).toHaveBeenCalledWith(expect.any(String), 'confirmed');

    await expect(estimateSolanaTransferFee({ ...transferParams(), assetId: 'USDC' }, client)).rejects.toThrow(
      'unsupported_solana_asset'
    );
    await expect(estimateSolanaTransferFee({ ...transferParams(), to: 'bad-address' }, client)).rejects.toThrow(
      'invalid_solana_recipient'
    );
    await expect(estimateSolanaTransferFee(transferParams(), createClient({ feeLamports: null }))).rejects.toThrow(
      'solana_fee_unavailable'
    );
  });

  it('estimates standard SPL token transfer fees from stored Solana token metadata', async () => {
    const state = createState({ tokenBalance: standardSolanaTokenBalance() });
    const client = createClient();

    await expect(estimateSolanaTransferFee(tokenTransferParams(state), client)).resolves.toBe('0.000005');
    expect(state.balanceService.getTokenBalance).toHaveBeenCalledWith(storedAccount, tokenMint, 'solana');
    expect(client.getLatestBlockhash).toHaveBeenCalledWith('confirmed');
    expect(client.getFeeForMessage).toHaveBeenCalledWith(expect.any(String), 'confirmed');
  });

  it('prepares, signs, and broadcasts standard SPL token transfers', async () => {
    vi.useFakeTimers();

    const state = createState({ tokenBalance: standardSolanaTokenBalance() });
    const prepareClient = createClient();
    const prepared = await prepareSolanaTransferForTest(tokenTransferParams(state), prepareClient);
    const sendClient = createClient({ sendSignature: prepared.signed.signatureBase58 });
    const callback = vi.fn();
    const { parsed } = parseCompiledInstructions(prepared.unsignedTransaction);

    expect(prepared.transferKind).toBe('spl-token');
    expect(prepared.amountBaseUnits).toBe(12_345_678n);
    expect(prepared.token).toMatchObject({
      decimals: 6,
      mint: tokenMint,
      sourceTokenAccount,
      tokenProgramId: SPL_TOKEN_PROGRAM_ADDRESS,
    });
    expect(parsed.accountKeys).toContain(recipientTokenAccount);

    await makeSolanaTransfer({ ...tokenTransferParams(state), callback }, sendClient);

    expect(sendClient.simulateTransaction).toHaveBeenCalledWith(prepared.signed.signedTransactionBase64, {
      commitment: 'confirmed',
      replaceRecentBlockhash: false,
      sigVerify: true,
    });
    expect(sendClient.sendRawTransaction).toHaveBeenCalledWith(prepared.signed.signedTransactionBase64, {
      maxRetries: 3,
      preflightCommitment: 'confirmed',
      skipPreflight: false,
    });
    expect(callback).toHaveBeenCalledWith({ status: true });

    await vi.advanceTimersByTimeAsync(8000);
    expect(state.balanceService.fetchBalance).toHaveBeenCalledWith({
      address: storedAccount,
      ethereumAddress: '',
      solanaAddress,
      solanaNetworks: ['Solana'],
      walletEcosystem: WalletEcosystem.Solana,
    });
  });

  it('fails closed before RPC when SPL token metadata is unsupported or incomplete', async () => {
    const unsupportedBalances = [
      standardSolanaTokenBalance({ solanaTokenProgram: 'token-2022' }),
      standardSolanaTokenBalance({ solanaTokenProgramId: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb' }),
      standardSolanaTokenBalance({ solanaTokenExtensions: ['transferFeeConfig'] }),
      standardSolanaTokenBalance({ solanaTokenTransferFeeConfig: {} }),
      standardSolanaTokenBalance({ solanaTokenTransferHook: {} }),
      standardSolanaTokenBalance({ solanaTokenState: 'frozen' }),
      standardSolanaTokenBalance({ solanaTokenAccountAddress: undefined }),
      standardSolanaTokenBalance({ solanaTokenMint: recipient }),
      standardSolanaTokenBalance({ precision: 256 }),
    ];

    for (const tokenBalance of unsupportedBalances) {
      const state = createState({ tokenBalance });
      const client = createClient();

      await expect(estimateSolanaTransferFee(tokenTransferParams(state), client)).rejects.toThrow(
        'unsupported_solana_asset'
      );
      expect(client.getLatestBlockhash).not.toHaveBeenCalled();
      expect(client.getFeeForMessage).not.toHaveBeenCalled();
    }

    const missingState = createState();
    const missingClient = createClient();

    await expect(estimateSolanaTransferFee(tokenTransferParams(missingState), missingClient)).rejects.toThrow(
      'unsupported_solana_asset'
    );
    expect(missingClient.getLatestBlockhash).not.toHaveBeenCalled();
  });

  it('signs, simulates, broadcasts, and schedules a Solana balance refresh', async () => {
    vi.useFakeTimers();

    const state = createState();
    const prepareClient = createClient();
    const prepared = await prepareSolanaTransferForTest(transferParams(state), prepareClient);
    const sendClient = createClient({ sendSignature: prepared.signed.signatureBase58 });
    const callback = vi.fn();

    await makeSolanaTransfer({ ...transferParams(state), callback }, sendClient);

    expect(prepared.signed.signer).toBe(solanaAddress);
    expect(sendClient.simulateTransaction).toHaveBeenCalledWith(prepared.signed.signedTransactionBase64, {
      commitment: 'confirmed',
      replaceRecentBlockhash: false,
      sigVerify: true,
    });
    expect(sendClient.sendRawTransaction).toHaveBeenCalledWith(prepared.signed.signedTransactionBase64, {
      maxRetries: 3,
      preflightCommitment: 'confirmed',
      skipPreflight: false,
    });
    expect(callback).toHaveBeenCalledWith({ status: true });

    await vi.advanceTimersByTimeAsync(8000);
    expect(state.balanceService.fetchBalance).toHaveBeenCalledWith({
      address: storedAccount,
      ethereumAddress: '',
      solanaAddress,
      solanaNetworks: ['Solana'],
      walletEcosystem: WalletEcosystem.Solana,
    });
  });

  it('fails closed on simulation errors and broadcast signature mismatches', async () => {
    const prepared = await prepareSolanaTransferForTest(transferParams(), createClient());

    await expect(
      makeSolanaTransfer(transferParams(), createClient({ sendSignature: prepared.signed.signatureBase58, simulationError: {} }))
    ).rejects.toThrow('solana_simulation_failed');
    await expect(makeSolanaTransfer(transferParams(), createClient({ sendSignature: recipient }))).rejects.toThrow(
      'solana_broadcast_signature_mismatch'
    );
  });
});
