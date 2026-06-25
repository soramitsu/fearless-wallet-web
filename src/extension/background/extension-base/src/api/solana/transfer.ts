import { ed25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha2';
import { base58Decode, base58Encode } from '@polkadot/util-crypto';
import {
  SolanaRpcClient,
  type SolanaRpcNetwork,
} from '@extension-base/services/solana-rpc-service';
import { type BalanceItem } from '@extension-base/api/evm/types';
import { type BasicTxResponse } from '@extension-base/background/types/types';
import type State from '@extension-base/background/handlers/State';
import type { FWKeyringMeta, NetworkJson } from '@extension-base/types';
import { UNIVERSAL_WALLET_SOLANA_RPC_ENDPOINTS } from '@/consts/universalWallet';
import { isSameString } from '@/helpers';
import { WalletEcosystem, type NetworkName } from '@/interfaces';
import { deriveSolanaAccount } from '@/util/solanaKeyring';
import {
  getSolanaSerializedMessageBase64,
  signSolanaSerializedTransaction,
  type SignedSolanaTransaction,
} from '@/util/solanaTransaction';

const LAMPORTS_PER_SOL = 1_000_000_000n;
const MAX_U64 = 18_446_744_073_709_551_615n;
const SOLANA_DECIMALS = 9;
const SOLANA_TRANSFER_INSTRUCTION = 2;
const SOLANA_TRANSFER_DATA_LENGTH = 12;
const SOLANA_TOKEN_TRANSFER_CHECKED_INSTRUCTION = 12;
const SOLANA_TOKEN_TRANSFER_CHECKED_DATA_LENGTH = 10;
const SOLANA_SIGNATURE_BYTES = 64;
const SOLANA_PUBKEY_BYTES = 32;
const SYSTEM_PROGRAM_ADDRESS = '11111111111111111111111111111111';
const SPL_TOKEN_PROGRAM_ADDRESS = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const ASSOCIATED_TOKEN_PROGRAM_ADDRESS = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
const PDA_MARKER = new TextEncoder().encode('ProgramDerivedAddress');
const DEFAULT_SEND_MAX_RETRIES = 3;

type HandleBasicTx = (data: BasicTxResponse) => void;

type SolanaTransferParams = {
  amount: string;
  assetId?: string;
  callback?: HandleBasicTx;
  from: string;
  networkKey: NetworkName;
  state: State;
  to: string;
};

type SolanaTransferSource = {
  accountAddress: string;
  mnemonicOrSeed: string;
  solanaAddress: string;
  walletEcosystem?: WalletEcosystem;
};

type SolanaTransferClient = Pick<
  SolanaRpcClient,
  'getFeeForMessage' | 'getLatestBlockhash' | 'sendRawTransaction' | 'simulateTransaction'
>;

type SolanaTransferKind = 'native' | 'spl-token';

type PreparedSolanaTransfer = {
  amountBaseUnits: bigint;
  assetId?: string;
  network: SolanaRpcNetwork;
  networkKey: NetworkName;
  recipient: string;
  rpcUrl: string;
  signed: SignedSolanaTransaction;
  source: SolanaTransferSource;
  token?: SolanaTokenTransferMetadata;
  transferKind: SolanaTransferKind;
  unsignedTransaction: Uint8Array;
};

type SolanaSystemTransferPayload = {
  from: string;
  lamports: bigint;
  recentBlockhash: string;
  to: string;
};

type SolanaSplTokenTransferPayload = {
  amount: bigint;
  decimals: number;
  from: string;
  mint: string;
  recentBlockhash: string;
  sourceTokenAccount: string;
  toOwner: string;
  tokenProgramId: string;
};

type SolanaTokenTransferMetadata = {
  decimals: number;
  mint: string;
  sourceTokenAccount: string;
  tokenProgramId: string;
};

type LegacyInstructionAccountMeta = {
  address: string;
  isSigner: boolean;
  isWritable: boolean;
};

type LegacyInstruction = {
  accounts: LegacyInstructionAccountMeta[];
  data: Uint8Array;
  programAddress: string;
};

type LegacyTransactionPayload = {
  feePayer: string;
  instructions: LegacyInstruction[];
  recentBlockhash: string;
};

type LegacyAccountMeta = LegacyInstructionAccountMeta & {
  bytes: Uint8Array;
  order: number;
};

function isSolanaTransferNetwork(network: NetworkJson | undefined): boolean {
  return network?.ecosystem === WalletEcosystem.Solana;
}

async function estimateSolanaTransferFee(
  params: SolanaTransferParams,
  client?: SolanaTransferClient
): Promise<string> {
  const { unsignedTransaction } = await prepareUnsignedSolanaTransfer(params, client);
  const transferClient = client ?? createSolanaTransferClient(params.state.networkService.networkMap[params.networkKey]);
  const { value } = await transferClient.getFeeForMessage(getSolanaSerializedMessageBase64(unsignedTransaction), 'confirmed');

  if (value === null) throw new Error('solana_fee_unavailable');

  return lamportsToSolString(BigInt(value));
}

async function makeSolanaTransfer(
  params: SolanaTransferParams,
  client?: SolanaTransferClient
): Promise<void> {
  const prepared = await prepareSolanaTransfer(params, client);
  const transferClient = client ?? createSolanaTransferClient(params.state.networkService.networkMap[params.networkKey]);
  const simulation = await transferClient.simulateTransaction(prepared.signed.signedTransactionBase64, {
    commitment: 'confirmed',
    replaceRecentBlockhash: false,
    sigVerify: true,
  });

  if (simulation.value.err !== null) throw new Error('solana_simulation_failed');

  const broadcastSignature = await transferClient.sendRawTransaction(prepared.signed.signedTransactionBase64, {
    maxRetries: DEFAULT_SEND_MAX_RETRIES,
    preflightCommitment: 'confirmed',
    skipPreflight: false,
  });

  if (broadcastSignature !== prepared.signed.signatureBase58) {
    throw new Error('solana_broadcast_signature_mismatch');
  }

  params.callback?.({ status: true });

  setTimeout(() => {
    params.state.balanceService
      .fetchBalance({
        address: prepared.source.accountAddress,
        ethereumAddress: '',
        solanaAddress: prepared.source.solanaAddress,
        solanaNetworks: [prepared.networkKey],
        walletEcosystem: WalletEcosystem.Solana,
      })
      .catch((error) => console.warn('Failed to refresh Solana balance after transfer', error));
  }, 8000);

  console.info(`Solana transfer broadcast: ${broadcastSignature}`);
}

async function prepareSolanaTransferForTest(
  params: SolanaTransferParams,
  client: SolanaTransferClient
): Promise<PreparedSolanaTransfer> {
  return prepareSolanaTransfer(params, client);
}

async function prepareSolanaTransfer(
  params: SolanaTransferParams,
  client?: SolanaTransferClient
): Promise<PreparedSolanaTransfer> {
  const unsigned = await prepareUnsignedSolanaTransfer(params, client);
  const signed = signSolanaSerializedTransaction({
    expectedSigner: unsigned.source.solanaAddress,
    mnemonic: unsigned.source.mnemonicOrSeed,
    transaction: unsigned.unsignedTransaction,
  });

  return {
    ...unsigned,
    signed,
  };
}

async function prepareUnsignedSolanaTransfer(
  { amount, assetId, from, networkKey, state, to }: SolanaTransferParams,
  client?: SolanaTransferClient
): Promise<Omit<PreparedSolanaTransfer, 'signed'>> {
  const networkJson = state.networkService.networkMap[networkKey];

  if (!isSolanaTransferNetwork(networkJson)) throw new Error('unsupported_solana_network');

  const network = getSolanaNetworkKind(networkJson);
  const rpcUrl = getSolanaRpcUrl(networkJson);
  const transferClient = client ?? new SolanaRpcClient({ network, rpcUrl });
  const source = resolveSolanaTransferSource(state, from);
  const recipient = normalizeSolanaAddress(to, 'invalid_solana_recipient');
  const asset = resolveSolanaTransferAsset({ amount, assetId, networkKey, source, state });
  const { value } = await transferClient.getLatestBlockhash('confirmed');
  const unsignedTransaction =
    asset.kind === 'native'
      ? createSolanaSystemTransferTransaction({
          from: source.solanaAddress,
          lamports: asset.amountBaseUnits,
          recentBlockhash: value.blockhash,
          to: recipient,
        })
      : createSolanaSplTokenTransferTransaction({
          amount: asset.amountBaseUnits,
          decimals: asset.token.decimals,
          from: source.solanaAddress,
          mint: asset.token.mint,
          recentBlockhash: value.blockhash,
          sourceTokenAccount: asset.token.sourceTokenAccount,
          toOwner: recipient,
          tokenProgramId: asset.token.tokenProgramId,
        });

  return {
    amountBaseUnits: asset.amountBaseUnits,
    assetId,
    network,
    networkKey,
    recipient,
    rpcUrl,
    source,
    token: asset.kind === 'spl-token' ? asset.token : undefined,
    transferKind: asset.kind,
    unsignedTransaction,
  };
}

function createSolanaSystemTransferTransaction({
  from,
  lamports,
  recentBlockhash,
  to,
}: SolanaSystemTransferPayload): Uint8Array {
  const instructionData = new Uint8Array(SOLANA_TRANSFER_DATA_LENGTH);

  writeU32Le(instructionData, 0, SOLANA_TRANSFER_INSTRUCTION);
  writeU64Le(instructionData, 4, lamports);

  return createLegacySolanaTransaction({
    feePayer: from,
    instructions: [
      {
        accounts: [
          { address: from, isSigner: true, isWritable: true },
          { address: to, isSigner: false, isWritable: true },
        ],
        data: instructionData,
        programAddress: SYSTEM_PROGRAM_ADDRESS,
      },
    ],
    recentBlockhash,
  });
}

function createSolanaSplTokenTransferTransaction({
  amount,
  decimals,
  from,
  mint,
  recentBlockhash,
  sourceTokenAccount,
  toOwner,
  tokenProgramId,
}: SolanaSplTokenTransferPayload): Uint8Array {
  const destinationTokenAccount = deriveAssociatedTokenAddress({ mint, owner: toOwner, tokenProgramId });
  const ataInstructionData = new Uint8Array([1]);
  const transferInstructionData = new Uint8Array(SOLANA_TOKEN_TRANSFER_CHECKED_DATA_LENGTH);

  assertSolanaTokenDecimals(decimals);
  writeU8(transferInstructionData, 0, SOLANA_TOKEN_TRANSFER_CHECKED_INSTRUCTION);
  writeU64Le(transferInstructionData, 1, amount);
  writeU8(transferInstructionData, 9, decimals);

  return createLegacySolanaTransaction({
    feePayer: from,
    instructions: [
      {
        accounts: [
          { address: from, isSigner: true, isWritable: true },
          { address: destinationTokenAccount, isSigner: false, isWritable: true },
          { address: toOwner, isSigner: false, isWritable: false },
          { address: mint, isSigner: false, isWritable: false },
          { address: SYSTEM_PROGRAM_ADDRESS, isSigner: false, isWritable: false },
          { address: tokenProgramId, isSigner: false, isWritable: false },
        ],
        data: ataInstructionData,
        programAddress: ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
      },
      {
        accounts: [
          { address: sourceTokenAccount, isSigner: false, isWritable: true },
          { address: mint, isSigner: false, isWritable: false },
          { address: destinationTokenAccount, isSigner: false, isWritable: true },
          { address: from, isSigner: true, isWritable: false },
        ],
        data: transferInstructionData,
        programAddress: tokenProgramId,
      },
    ],
    recentBlockhash,
  });
}

function resolveSolanaTransferSource(state: State, from: string): SolanaTransferSource {
  const account = state.keyringService.getAllAccounts().find(({ address, meta }) => {
    const { solanaAddress } = meta as FWKeyringMeta;

    return address === from || solanaAddress === from;
  });

  if (!account) throw new Error('solana_account_not_found');

  const meta = account.meta as FWKeyringMeta;
  const solanaAddress = normalizeSolanaAddress(meta.solanaAddress ?? account.address, 'invalid_solana_source_address');
  const { seed } = state.keyringService.exportMnemonic({
    address: account.address,
    walletEcosystem: meta.walletEcosystem,
  });

  if (!seed) throw new Error('solana_mnemonic_unavailable');

  const derived = deriveSolanaAccount({ mnemonic: seed });

  if (derived.address !== solanaAddress) throw new Error('invalid_solana_source_address');

  return {
    accountAddress: account.address,
    mnemonicOrSeed: seed,
    solanaAddress,
    walletEcosystem: meta.walletEcosystem,
  };
}

function getSolanaNetworkKind(network: NetworkJson | undefined): SolanaRpcNetwork {
  if (!isSolanaTransferNetwork(network)) throw new Error('unsupported_solana_network');

  const descriptor = [network.name, network.key, network.chainId, ...(network.options ?? [])].join(' ').toLowerCase();

  return descriptor.includes('devnet') || descriptor.includes('testnet') ? 'devnet' : 'mainnet';
}

function getSolanaRpcUrl(network: NetworkJson): string {
  const selectedProvider = network.providers?.[network.currentProvider] ?? network.customProviders?.[network.currentProvider];
  const selectedNode = network.nodes?.[0]?.url ?? network.customNodes?.[0]?.url;

  return selectedProvider ?? selectedNode ?? UNIVERSAL_WALLET_SOLANA_RPC_ENDPOINTS[getSolanaNetworkKind(network)];
}

function solanaAmountToLamports(amount: string): bigint {
  if (amount.trim() !== amount) throw new Error('invalid_solana_amount');

  const match = /^(0|[1-9]\d*)(?:\.(\d{1,9}))?$/u.exec(amount);

  if (!match) throw new Error('invalid_solana_amount');

  const whole = BigInt(match[1]);
  const fraction = BigInt((match[2] ?? '').padEnd(SOLANA_DECIMALS, '0'));
  const lamports = whole * LAMPORTS_PER_SOL + fraction;

  if (lamports <= 0n || lamports > MAX_U64) throw new Error('invalid_solana_amount');

  return lamports;
}

function lamportsToSolString(lamports: bigint): string {
  if (lamports < 0n || lamports > MAX_U64) throw new Error('invalid_solana_amount');

  const whole = lamports / LAMPORTS_PER_SOL;
  const fraction = (lamports % LAMPORTS_PER_SOL).toString().padStart(SOLANA_DECIMALS, '0').replace(/0+$/u, '');

  return fraction ? `${whole.toString()}.${fraction}` : whole.toString();
}

function solanaTokenAmountToBaseUnits(amount: string, decimals: number): bigint {
  if (amount.trim() !== amount) throw new Error('invalid_solana_amount');

  assertSolanaTokenDecimals(decimals);

  const pattern =
    decimals === 0 ? /^(0|[1-9]\d*)$/u : new RegExp(`^(0|[1-9]\\d*)(?:\\.(\\d{1,${decimals}}))?$`, 'u');
  const match = pattern.exec(amount);

  if (!match) throw new Error('invalid_solana_amount');

  const whole = BigInt(match[1]);
  const multiplier = 10n ** BigInt(decimals);
  const fraction = BigInt((match[2] ?? '').padEnd(decimals, '0') || '0');
  const baseUnits = whole * multiplier + fraction;

  if (baseUnits <= 0n || baseUnits > MAX_U64) throw new Error('invalid_solana_amount');

  return baseUnits;
}

function normalizeSolanaAddress(address: string, errorCode = 'invalid_solana_address'): string {
  if (typeof address !== 'string' || address.trim() !== address) throw new Error(errorCode);

  decodeSolanaPubkey(address, errorCode);

  return address;
}

function deriveAssociatedTokenAddress({
  mint,
  owner,
  tokenProgramId = SPL_TOKEN_PROGRAM_ADDRESS,
}: {
  mint: string;
  owner: string;
  tokenProgramId?: string;
}): string {
  const address = findSolanaProgramAddress(
    [
      decodeSolanaPubkey(owner, 'invalid_solana_recipient'),
      decodeSolanaPubkey(tokenProgramId, 'unsupported_solana_asset'),
      decodeSolanaPubkey(mint, 'unsupported_solana_asset'),
    ],
    decodeSolanaPubkey(ASSOCIATED_TOKEN_PROGRAM_ADDRESS, 'unsupported_solana_asset')
  );

  return base58Encode(address);
}

function resolveSolanaTransferAsset({
  amount,
  assetId,
  networkKey,
  source,
  state,
}: {
  amount: string;
  assetId?: string;
  networkKey: NetworkName;
  source: SolanaTransferSource;
  state: State;
}):
  | { amountBaseUnits: bigint; kind: 'native' }
  | { amountBaseUnits: bigint; kind: 'spl-token'; token: SolanaTokenTransferMetadata } {
  if (isNativeSolanaAsset(assetId)) return { amountBaseUnits: solanaAmountToLamports(amount), kind: 'native' };

  const token = resolveStandardSplTokenTransferMetadata(state, source.accountAddress, networkKey, assetId);

  return {
    amountBaseUnits: solanaTokenAmountToBaseUnits(amount, token.decimals),
    kind: 'spl-token',
    token,
  };
}

function isNativeSolanaAsset(assetId: string | undefined): boolean {
  return !assetId || assetId.toUpperCase() === 'SOL';
}

function resolveStandardSplTokenTransferMetadata(
  state: State,
  accountAddress: string,
  networkKey: NetworkName,
  assetId: string
): SolanaTokenTransferMetadata {
  const balance = findSolanaTokenBalanceItem(state, accountAddress, networkKey, assetId);

  if (!balance) throw new Error('unsupported_solana_asset');
  if (balance.solanaTokenProgram !== 'spl-token') throw new Error('unsupported_solana_asset');
  if (balance.solanaTokenProgramId !== SPL_TOKEN_PROGRAM_ADDRESS) throw new Error('unsupported_solana_asset');
  if ((balance.solanaTokenExtensions ?? []).length > 0) throw new Error('unsupported_solana_asset');
  if (balance.solanaTokenTransferFeeConfig != null || balance.solanaTokenTransferHook != null) {
    throw new Error('unsupported_solana_asset');
  }
  if (balance.solanaTokenState && !isSameString(balance.solanaTokenState, 'initialized')) {
    throw new Error('unsupported_solana_asset');
  }

  assertSolanaTokenDecimals(balance.precision);

  const mint = normalizeSolanaAddress(balance.solanaTokenMint ?? balance.id, 'unsupported_solana_asset');

  if (mint !== assetId) throw new Error('unsupported_solana_asset');

  return {
    decimals: balance.precision,
    mint,
    sourceTokenAccount: normalizeSolanaAddress(balance.solanaTokenAccountAddress ?? '', 'unsupported_solana_asset'),
    tokenProgramId: normalizeSolanaAddress(balance.solanaTokenProgramId ?? '', 'unsupported_solana_asset'),
  };
}

function findSolanaTokenBalanceItem(
  state: State,
  accountAddress: string,
  networkKey: NetworkName,
  assetId: string
): BalanceItem | undefined {
  try {
    const tokenGroup = state.balanceService.getTokenBalance(accountAddress, assetId, 'solana');

    return tokenGroup?.balances?.find(({ name }) => isSameString(name, networkKey));
  } catch {
    return undefined;
  }
}

function assertSolanaTokenDecimals(decimals: number): void {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) throw new Error('unsupported_solana_asset');
}

function createLegacySolanaTransaction({ feePayer, instructions, recentBlockhash }: LegacyTransactionPayload): Uint8Array {
  const accountMetas = compileLegacyAccountMetas(feePayer, instructions);
  const blockhash = decodeSolanaPubkey(recentBlockhash, 'invalid_solana_blockhash');
  const accountIndex = new Map(accountMetas.map(({ address }, index) => [address, index]));
  const requiredSignatures = accountMetas.filter(({ isSigner }) => isSigner).length;
  const readonlySignedAccounts = accountMetas.filter(({ isSigner, isWritable }) => isSigner && !isWritable).length;
  const readonlyUnsignedAccounts = accountMetas.filter(({ isSigner, isWritable }) => !isSigner && !isWritable).length;
  const compiledInstructions = instructions.map((instruction) => {
    const programIndex = accountIndex.get(instruction.programAddress);

    if (programIndex === undefined) throw new Error('invalid_solana_instruction_program');

    const accountIndexes = instruction.accounts.map(({ address }) => {
      const index = accountIndex.get(address);

      if (index === undefined) throw new Error('invalid_solana_instruction_account');

      return index;
    });

    return concatBytes(
      new Uint8Array([programIndex]),
      encodeCompactU16(accountIndexes.length),
      new Uint8Array(accountIndexes),
      encodeCompactU16(instruction.data.length),
      instruction.data
    );
  });

  const message = concatBytes(
    new Uint8Array([requiredSignatures, readonlySignedAccounts, readonlyUnsignedAccounts]),
    encodeCompactU16(accountMetas.length),
    ...accountMetas.map(({ bytes }) => bytes),
    blockhash,
    encodeCompactU16(compiledInstructions.length),
    ...compiledInstructions
  );

  return concatBytes(encodeCompactU16(requiredSignatures), new Uint8Array(SOLANA_SIGNATURE_BYTES * requiredSignatures), message);
}

function compileLegacyAccountMetas(feePayer: string, instructions: LegacyInstruction[]): LegacyAccountMeta[] {
  const accounts = new Map<string, LegacyAccountMeta>();
  let order = 0;

  const addAccount = ({ address, isSigner, isWritable }: LegacyInstructionAccountMeta): void => {
    const bytes = decodeSolanaPubkey(address, 'invalid_solana_address');
    const existing = accounts.get(address);

    if (existing) {
      existing.isSigner ||= isSigner;
      existing.isWritable ||= isWritable;

      return;
    }

    accounts.set(address, { address, bytes, isSigner, isWritable, order });
    order += 1;
  };

  addAccount({ address: feePayer, isSigner: true, isWritable: true });

  instructions.forEach((instruction) => {
    instruction.accounts.forEach(addAccount);
    addAccount({ address: instruction.programAddress, isSigner: false, isWritable: false });
  });

  return [...accounts.values()].sort((a, b) => accountMetaSortGroup(a) - accountMetaSortGroup(b) || a.order - b.order);
}

function accountMetaSortGroup({ isSigner, isWritable }: LegacyInstructionAccountMeta): number {
  if (isSigner && isWritable) return 0;
  if (isSigner) return 1;
  if (isWritable) return 2;

  return 3;
}

function findSolanaProgramAddress(seeds: Uint8Array[], programId: Uint8Array): Uint8Array {
  for (let bump = 255; bump >= 0; bump -= 1) {
    const candidate = sha256(concatBytes(...seeds, new Uint8Array([bump]), programId, PDA_MARKER));

    if (!isOnEd25519Curve(candidate)) return candidate;
  }

  throw new Error('invalid_solana_pda');
}

function isOnEd25519Curve(publicKey: Uint8Array): boolean {
  try {
    ed25519.ExtendedPoint.fromHex(publicKey);

    return true;
  } catch {
    return false;
  }
}

function createSolanaTransferClient(network: NetworkJson | undefined): SolanaRpcClient {
  if (!network) throw new Error('unsupported_solana_network');

  return new SolanaRpcClient({
    network: getSolanaNetworkKind(network),
    rpcUrl: getSolanaRpcUrl(network),
  });
}

function decodeSolanaPubkey(address: string, errorCode: string): Uint8Array {
  try {
    const bytes = base58Decode(address);

    if (bytes.length !== SOLANA_PUBKEY_BYTES) throw new Error(errorCode);

    return bytes;
  } catch {
    throw new Error(errorCode);
  }
}

function encodeCompactU16(value: number): Uint8Array {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) throw new Error('invalid_solana_compact_u16');

  const result: number[] = [];
  let remaining = value;

  do {
    let byte = remaining & 0x7f;

    remaining >>= 7;
    if (remaining > 0) byte |= 0x80;
    result.push(byte);
  } while (remaining > 0);

  return new Uint8Array(result);
}

function writeU32Le(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >> 8) & 0xff;
  target[offset + 2] = (value >> 16) & 0xff;
  target[offset + 3] = (value >> 24) & 0xff;
}

function writeU8(target: Uint8Array, offset: number, value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) throw new Error('invalid_solana_u8');

  target[offset] = value;
}

function writeU64Le(target: Uint8Array, offset: number, value: bigint): void {
  if (value < 0n || value > MAX_U64) throw new Error('invalid_solana_amount');

  let remaining = value;

  for (let index = 0; index < 8; index += 1) {
    target[offset + index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
}

function concatBytes(...chunks: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

export {
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  SPL_TOKEN_PROGRAM_ADDRESS,
  SYSTEM_PROGRAM_ADDRESS,
  createSolanaSplTokenTransferTransaction,
  createSolanaSystemTransferTransaction,
  deriveAssociatedTokenAddress,
  estimateSolanaTransferFee,
  getSolanaNetworkKind,
  getSolanaRpcUrl,
  isSolanaTransferNetwork,
  lamportsToSolString,
  makeSolanaTransfer,
  normalizeSolanaAddress,
  prepareSolanaTransferForTest,
  resolveSolanaTransferSource,
  solanaAmountToLamports,
  solanaTokenAmountToBaseUnits,
  type PreparedSolanaTransfer,
  type SolanaTransferClient,
  type SolanaTransferParams,
  type SolanaTransferSource,
};
