import { ed25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha2';
import { base58Decode, base58Encode } from '@polkadot/util-crypto';
import {
  SolanaRpcClient,
  SolanaRpcError,
  type SolanaLatestBlockhash,
  type SolanaParsedAccount,
  type SolanaRpcNetwork,
} from '@extension-base/services/solana-rpc-service';
import { assertSendCapability } from '@extension-base/services/send-kill-switch-service';
import { type BalanceItem } from '@extension-base/api/evm/types';
import { type BasicTxResponse, type ResponseSolanaTransferQuote } from '@extension-base/background/types/types';
import {
  getDefaultSolanaPendingSendStore,
  resolveSolanaPendingSends,
  type SolanaPendingSendStore,
} from './pendingSends';
import type State from '@extension-base/background/handlers/State';
import type { FWKeyringMeta, NetworkJson } from '@extension-base/types';
import { UNIVERSAL_WALLET_SOLANA_RPC_FAILOVER_ENDPOINTS } from '@/consts/universalWallet';
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
const SOLANA_SET_COMPUTE_UNIT_LIMIT_INSTRUCTION = 2;
const SOLANA_SET_COMPUTE_UNIT_PRICE_INSTRUCTION = 3;
const SOLANA_SIGNATURE_BYTES = 64;
const SOLANA_PUBKEY_BYTES = 32;
const SOLANA_TOKEN_ACCOUNT_BYTES = 165;
const SOLANA_BASE_FEE_LAMPORTS_PER_SIGNATURE = 5_000n;
const SYSTEM_PROGRAM_ADDRESS = '11111111111111111111111111111111';
const SPL_TOKEN_PROGRAM_ADDRESS = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_2022_PROGRAM_ADDRESS = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const ASSOCIATED_TOKEN_PROGRAM_ADDRESS = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
const COMPUTE_BUDGET_PROGRAM_ADDRESS = 'ComputeBudget111111111111111111111111111111';
const PDA_MARKER = new TextEncoder().encode('ProgramDerivedAddress');
const DEFAULT_SEND_MAX_RETRIES = 3;

// Fixed compute budgets keep the quoted fee identical to the fee the send pays.
// They sit well above what these instructions consume; the signed simulation
// before broadcast still refuses anything that would exceed them.
const SOLANA_COMPUTE_UNIT_LIMITS = Object.freeze({
  native: 1_000,
  splToken: 20_000,
  splTokenWithAccountCreation: 60_000,
});
// Priority fee per compute unit, from recent fees on the accounts the transfer
// writes, bounded so a faulty RPC cannot inflate it.
export const SOLANA_MIN_COMPUTE_UNIT_PRICE = 1_000;
export const SOLANA_MAX_COMPUTE_UNIT_PRICE = 2_000_000;
const SOLANA_DEFAULT_COMPUTE_UNIT_PRICE = 50_000;
const SOLANA_PRIORITY_FEE_PERCENTILE = 0.75;

const SIGNATURE_POLL_INTERVAL_MS = 1_000;
const REBROADCAST_EVERY_POLLS = 2;
const BLOCK_HEIGHT_CHECK_EVERY_POLLS = 3;
const MAX_CONFIRMATION_WAIT_MS = 120_000;

type HandleBasicTx = (data: BasicTxResponse) => void;

type SolanaTransferParams = {
  amount: string;
  assetId?: string;
  callback?: HandleBasicTx;
  from: string;
  networkKey: NetworkName;
  solanaComputeUnitPriceMicroLamports?: number;
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
  | 'getAccountInfo'
  | 'getBalance'
  | 'getBlockHeight'
  | 'getFeeForMessage'
  | 'getLatestBlockhash'
  | 'getMinimumBalanceForRentExemption'
  | 'getRecentPrioritizationFees'
  | 'getSignatureStatuses'
  | 'sendRawTransaction'
  | 'simulateTransaction'
>;

type SolanaTransferKind = 'native' | 'spl-token';

/**
 * Where the transferred asset lands. SOL always goes to a wallet. A token goes
 * to the wallet's associated token account (created when missing), or straight
 * into an existing token account of the same mint when that is what the user
 * pasted.
 */
type SolanaTransferDestination =
  | { createTokenAccount: false; kind: 'wallet'; recipientExists: boolean }
  | { createTokenAccount: boolean; kind: 'wallet-token-account'; tokenAccount: string }
  | { createTokenAccount: false; kind: 'token-account'; tokenAccount: string };

type PreparedSolanaTransfer = {
  accountCreationLamports: bigint;
  amountBaseUnits: bigint;
  assetId?: string;
  blockhash: SolanaLatestBlockhash;
  computeUnitLimit: number;
  computeUnitPriceMicroLamports: number;
  destination: SolanaTransferDestination;
  feeLamports: bigint;
  maxSendableBaseUnits: bigint;
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

type SolanaComputeBudget = {
  unitLimit: number;
  unitPriceMicroLamports: number;
};

type SolanaSystemTransferPayload = {
  computeBudget?: SolanaComputeBudget;
  from: string;
  lamports: bigint;
  recentBlockhash: string;
  to: string;
};

type SolanaSplTokenTransferPayload = {
  amount: bigint;
  computeBudget?: SolanaComputeBudget;
  /** Defaults to creating the recipient's associated token account idempotently. */
  createDestinationAccount?: boolean;
  decimals: number;
  /** An existing token account to credit instead of the owner's associated one. */
  destinationTokenAccount?: string;
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
  sourceAmount?: bigint;
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

type SolanaSendOptions = {
  maxConfirmationWaitMs?: number;
  now?: () => number;
  pendingStore?: SolanaPendingSendStore;
  pollIntervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

class SolanaTransferError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'SolanaTransferError';
  }
}

function isSolanaTransferNetwork(network: NetworkJson | undefined): boolean {
  return network?.ecosystem === WalletEcosystem.Solana;
}

/**
 * Fee, account-creation deposit and the largest sendable amount for the Send
 * screen. Without an amount only the fee and maximum are quoted; recipient and
 * balance problems come back as `unavailableReason` instead of throwing.
 */
async function quoteSolanaTransfer(
  params: Omit<SolanaTransferParams, 'callback'>,
  client?: SolanaTransferClient
): Promise<ResponseSolanaTransferQuote & { fee: string }> {
  await assertSendCapability(params.state, 'solanaSend');

  const plan = await planSolanaTransfer(params, client, { quote: true });

  return {
    accountCreationDeposit: lamportsToSolString(plan.accountCreationLamports),
    baseFee: lamportsToSolString(plan.baseFeeLamports),
    computeUnitLimit: plan.computeUnitLimit,
    computeUnitPriceMicroLamports: plan.computeUnitPriceMicroLamports,
    fee: lamportsToSolString(plan.feeLamports + plan.accountCreationLamports),
    maxSendable: baseUnitsToDecimalString(plan.maxSendableBaseUnits, plan.decimals),
    priorityFee: lamportsToSolString(plan.feeLamports - plan.baseFeeLamports),
    recipientIsTokenAccount: plan.destination.kind === 'token-account',
    unavailableReason: plan.unavailableReason,
  };
}

async function estimateSolanaTransferFee(
  params: SolanaTransferParams,
  client?: SolanaTransferClient
): Promise<string> {
  const plan = await planSolanaTransfer(params, client, { quote: false });

  return lamportsToSolString(plan.feeLamports + plan.accountCreationLamports);
}

async function makeSolanaTransfer(
  params: SolanaTransferParams,
  client?: SolanaTransferClient,
  {
    maxConfirmationWaitMs = MAX_CONFIRMATION_WAIT_MS,
    now = Date.now,
    pendingStore = getDefaultSolanaPendingSendStore(),
    pollIntervalMs = SIGNATURE_POLL_INTERVAL_MS,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  }: SolanaSendOptions = {}
): Promise<void> {
  await assertSendCapability(params.state, 'solanaSend');

  const networkJson = params.state.networkService.networkMap[params.networkKey];
  const transferClient = client ?? createSolanaTransferClient(networkJson);
  const source = resolveSolanaTransferSource(params.state, params.from);
  const network = getSolanaNetworkKind(networkJson);
  const pending = (await pendingStore.list()).filter(
    (record) => record.accountAddress === source.accountAddress && record.network === network
  );
  const { resolved, unresolved } = await resolveSolanaPendingSends(pending, transferClient);

  if (resolved.length) await pendingStore.remove(resolved.map(({ signature }) => signature));
  // A Solana transaction cannot conflict with an earlier one, so a new send waits
  // until the previous one has landed or expired.
  if (unresolved.length) throw new Error('solana_previous_send_pending');

  const prepared = await prepareSolanaTransfer(params, transferClient);
  const signature = prepared.signed.signatureBase58;
  const transactionBase64 = prepared.signed.signedTransactionBase64;
  const simulation = await transferClient.simulateTransaction(transactionBase64, {
    commitment: 'confirmed',
    replaceRecentBlockhash: false,
    sigVerify: true,
  });

  if (simulation.value.err !== null) throw new Error('solana_simulation_failed');

  // Recorded before broadcast so a stopped service worker still finds it.
  await pendingStore.save({
    accountAddress: source.accountAddress,
    createdAt: now(),
    lastValidBlockHeight: prepared.blockhash.lastValidBlockHeight,
    network,
    signature,
    transactionBase64,
  });

  try {
    const broadcastSignature = await transferClient.sendRawTransaction(transactionBase64, {
      maxRetries: DEFAULT_SEND_MAX_RETRIES,
      preflightCommitment: 'confirmed',
      skipPreflight: false,
    });

    // A node answering with someone else's signature is broken; whether it
    // relayed ours is unknown, so the record stays until the next send resolves it.
    if (broadcastSignature !== signature) throw new Error('solana_broadcast_signature_mismatch');
  } catch (error) {
    if (error instanceof SolanaRpcError && error.message === 'solana_rpc_error') {
      // The node ran preflight and refused the transaction: nothing was relayed.
      await pendingStore.remove([signature]);
      throw new Error('solana_simulation_failed', { cause: error });
    }
    if (error instanceof Error && error.message === 'solana_broadcast_signature_mismatch') throw error;
    // Anything else (timeout, throttling, every node unreachable) is ambiguous:
    // keep polling the signature and rebroadcasting the same bytes.
  }

  const outcome = await waitForSolanaSignature({
    client: transferClient,
    lastValidBlockHeight: prepared.blockhash.lastValidBlockHeight,
    maxWaitMs: maxConfirmationWaitMs,
    now,
    pollIntervalMs,
    signature,
    sleep,
    transactionBase64,
  });

  if (outcome !== 'pending') await pendingStore.remove([signature]);
  if (outcome === 'failed') throw new Error('solana_transaction_failed');
  if (outcome === 'expired') throw new Error('solana_transaction_expired');
  if (outcome === 'pending') throw new Error('solana_broadcast_ambiguous');

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

  console.info(`Solana transfer confirmed: ${signature}`);
}

/**
 * Polls the signature until the network confirms it, reports it failed, or its
 * blockhash expires; rebroadcasts the identical signed bytes meanwhile.
 */
async function waitForSolanaSignature({
  client,
  lastValidBlockHeight,
  maxWaitMs,
  now,
  pollIntervalMs,
  signature,
  sleep,
  transactionBase64,
}: {
  client: Pick<SolanaTransferClient, 'getBlockHeight' | 'getSignatureStatuses' | 'sendRawTransaction'>;
  lastValidBlockHeight: number;
  maxWaitMs: number;
  now: () => number;
  pollIntervalMs: number;
  signature: string;
  sleep: (ms: number) => Promise<void>;
  transactionBase64: string;
}): Promise<'confirmed' | 'expired' | 'failed' | 'pending'> {
  const deadline = now() + maxWaitMs;

  for (let poll = 0; ; poll += 1) {
    try {
      const [status] = await client.getSignatureStatuses([signature]);

      if (status?.err) return 'failed';
      if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') return 'confirmed';
      if (!status && poll % BLOCK_HEIGHT_CHECK_EVERY_POLLS === BLOCK_HEIGHT_CHECK_EVERY_POLLS - 1) {
        if ((await client.getBlockHeight('confirmed')) > lastValidBlockHeight) {
          // One last look: it may have landed in the final valid block.
          const [finalStatus] = await client.getSignatureStatuses([signature]);

          if (!finalStatus) return 'expired';
          if (finalStatus.err) return 'failed';
        }
      }
      if (!status && poll % REBROADCAST_EVERY_POLLS === REBROADCAST_EVERY_POLLS - 1) {
        await client.sendRawTransaction(transactionBase64, { maxRetries: 0, skipPreflight: true }).catch(() => undefined);
      }
    } catch {
      // An RPC hiccup is not an outcome; keep polling until the deadline.
    }

    if (now() >= deadline) return 'pending';

    await sleep(pollIntervalMs);
  }
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
  const plan = await planSolanaTransfer(params, client, { quote: false });
  const signed = signSolanaSerializedTransaction({
    expectedSigner: plan.source.solanaAddress,
    mnemonic: plan.source.mnemonicOrSeed,
    transaction: plan.unsignedTransaction,
  });

  return {
    accountCreationLamports: plan.accountCreationLamports,
    amountBaseUnits: plan.amountBaseUnits,
    assetId: params.assetId,
    blockhash: plan.blockhash,
    computeUnitLimit: plan.computeUnitLimit,
    computeUnitPriceMicroLamports: plan.computeUnitPriceMicroLamports,
    destination: plan.destination,
    feeLamports: plan.feeLamports,
    maxSendableBaseUnits: plan.maxSendableBaseUnits,
    network: plan.network,
    networkKey: params.networkKey,
    recipient: plan.recipient,
    rpcUrl: plan.rpcUrl,
    signed,
    source: plan.source,
    token: plan.token,
    transferKind: plan.transferKind,
    unsignedTransaction: plan.unsignedTransaction,
  };
}

type SolanaTransferPlan = Omit<PreparedSolanaTransfer, 'assetId' | 'networkKey' | 'signed'> & {
  baseFeeLamports: bigint;
  decimals: number;
  unavailableReason?: string;
};

/**
 * Builds the unsigned transfer and checks everything the network would refuse
 * or that would lose funds: recipient type, rent-exempt minimums, the token
 * account the recipient needs, the fee and the balance.
 */
async function planSolanaTransfer(
  { amount, assetId, from, networkKey, solanaComputeUnitPriceMicroLamports, state, to }: Omit<SolanaTransferParams, 'callback'>,
  client: SolanaTransferClient | undefined,
  { quote }: { quote: boolean }
): Promise<SolanaTransferPlan> {
  const networkJson = state.networkService.networkMap[networkKey];

  if (!isSolanaTransferNetwork(networkJson)) throw new Error('unsupported_solana_network');

  const network = getSolanaNetworkKind(networkJson);
  const rpcUrl = getSolanaRpcUrl(networkJson);
  const transferClient = client ?? createSolanaTransferClient(networkJson);
  const source = resolveSolanaTransferSource(state, from);
  const recipient = normalizeSolanaAddress(to, 'invalid_solana_recipient');
  const asset = resolveSolanaTransferAsset({ amount, assetId, networkKey, quote, source, state });
  const failures: string[] = [];
  const fail = (code: string) => {
    if (!quote) throw new Error(code);
    failures.push(code);
  };
  const [recipientAccount, balance, rentExemptMinimum, latestBlockhash] = await Promise.all([
    transferClient.getAccountInfo(recipient),
    transferClient.getBalance(source.solanaAddress),
    transferClient.getMinimumBalanceForRentExemption(0),
    transferClient.getLatestBlockhash('confirmed'),
  ]);
  const blockhash = latestBlockhash.value;
  const balanceLamports = BigInt(balance);
  const rentLamports = BigInt(rentExemptMinimum);
  let destination: SolanaTransferDestination;

  try {
    destination = await resolveSolanaDestination({ asset, client: transferClient, recipient, recipientAccount });
  } catch (error) {
    if (!(error instanceof SolanaTransferError)) throw error;
    if (!quote) throw new Error(error.code, { cause: error });

    // A quote still prices the transfer; the recipient problem is reported.
    failures.push(error.code);
    destination = { createTokenAccount: false, kind: 'wallet', recipientExists: true };
  }

  const accountCreationLamports = destination.createTokenAccount
    ? BigInt(await transferClient.getMinimumBalanceForRentExemption(SOLANA_TOKEN_ACCOUNT_BYTES))
    : 0n;
  const computeUnitLimit =
    asset.kind === 'native'
      ? SOLANA_COMPUTE_UNIT_LIMITS.native
      : destination.createTokenAccount
        ? SOLANA_COMPUTE_UNIT_LIMITS.splTokenWithAccountCreation
        : SOLANA_COMPUTE_UNIT_LIMITS.splToken;
  const computeUnitPriceMicroLamports = await resolveComputeUnitPrice({
    client: transferClient,
    quoted: solanaComputeUnitPriceMicroLamports,
    writableAccounts: [
      source.solanaAddress,
      ...(asset.kind === 'native'
        ? [recipient]
        : [asset.token.sourceTokenAccount, ...(destination.kind === 'wallet' ? [] : [destination.tokenAccount])]),
    ],
  });
  const computeBudget = { unitLimit: computeUnitLimit, unitPriceMicroLamports: computeUnitPriceMicroLamports };
  const amountForBuild = asset.amountBaseUnits ?? 1n;
  const unsignedTransaction =
    asset.kind === 'native'
      ? createSolanaSystemTransferTransaction({
          computeBudget,
          from: source.solanaAddress,
          lamports: amountForBuild,
          recentBlockhash: blockhash.blockhash,
          to: recipient,
        })
      : createSolanaSplTokenTransferTransaction({
          amount: amountForBuild,
          computeBudget,
          createDestinationAccount: destination.createTokenAccount,
          decimals: asset.token.decimals,
          destinationTokenAccount: destination.kind === 'token-account' ? destination.tokenAccount : undefined,
          from: source.solanaAddress,
          mint: asset.token.mint,
          recentBlockhash: blockhash.blockhash,
          sourceTokenAccount: asset.token.sourceTokenAccount,
          toOwner: recipient,
          tokenProgramId: asset.token.tokenProgramId,
        });
  const { value: fee } = await transferClient.getFeeForMessage(
    getSolanaSerializedMessageBase64(unsignedTransaction),
    'confirmed'
  );

  if (fee === null) throw new Error('solana_fee_unavailable');

  const feeLamports = BigInt(fee);
  const solCost = feeLamports + accountCreationLamports + (asset.kind === 'native' ? asset.amountBaseUnits ?? 0n : 0n);
  const remainingLamports = balanceLamports - solCost;
  const recipientExists = destination.kind === 'wallet' ? destination.recipientExists : true;
  let maxSendableBaseUnits: bigint;

  if (asset.kind === 'native') {
    const maxLamports = balanceLamports - feeLamports;

    maxSendableBaseUnits = maxLamports > 0n && (recipientExists || maxLamports >= rentLamports) ? maxLamports : 0n;
  } else {
    const solAfterFees = balanceLamports - feeLamports - accountCreationLamports;
    const canPayFees = solAfterFees === 0n || solAfterFees >= rentLamports;

    maxSendableBaseUnits = canPayFees ? asset.token.sourceAmount ?? 0n : 0n;
  }

  if (asset.amountBaseUnits !== undefined) {
    if (remainingLamports < 0n) fail(asset.kind === 'native' ? 'solana_insufficient_funds' : 'solana_insufficient_sol_for_fee');
    else if (remainingLamports > 0n && remainingLamports < rentLamports) fail('solana_sender_below_rent');
    if (asset.kind === 'native' && !recipientExists && asset.amountBaseUnits < rentLamports) {
      fail('solana_amount_below_rent');
    }
    if (asset.kind === 'spl-token' && asset.token.sourceAmount !== undefined && asset.amountBaseUnits > asset.token.sourceAmount) {
      fail('solana_insufficient_token_balance');
    }
  }

  return {
    accountCreationLamports,
    amountBaseUnits: amountForBuild,
    baseFeeLamports: SOLANA_BASE_FEE_LAMPORTS_PER_SIGNATURE,
    blockhash,
    computeUnitLimit,
    computeUnitPriceMicroLamports,
    decimals: asset.kind === 'native' ? SOLANA_DECIMALS : asset.token.decimals,
    destination,
    feeLamports,
    maxSendableBaseUnits,
    network,
    recipient,
    rpcUrl,
    source,
    token: asset.kind === 'spl-token' ? asset.token : undefined,
    transferKind: asset.kind,
    unavailableReason: failures[0],
    unsignedTransaction,
  };
}

/**
 * Rejects recipients that would lose funds: executable programs, accounts owned
 * by programs other than the System Program, off-curve addresses that are not
 * an existing System account, and token accounts or mints for a SOL transfer or
 * for another token.
 */
async function resolveSolanaDestination({
  asset,
  client,
  recipient,
  recipientAccount,
}: {
  asset: ReturnType<typeof resolveSolanaTransferAsset>;
  client: Pick<SolanaTransferClient, 'getAccountInfo'>;
  recipient: string;
  recipientAccount: SolanaParsedAccount | null;
}): Promise<SolanaTransferDestination> {
  if (recipientAccount?.executable) throw new SolanaTransferError('solana_recipient_program');

  if (recipientAccount && isTokenProgram(recipientAccount.owner)) {
    if (asset.kind !== 'spl-token') throw new SolanaTransferError('solana_recipient_token_account');

    const tokenAccount = parseTokenAccount(recipientAccount);

    if (
      !tokenAccount ||
      tokenAccount.mint !== asset.token.mint ||
      recipientAccount.owner !== asset.token.tokenProgramId ||
      tokenAccount.state !== 'initialized'
    ) {
      throw new SolanaTransferError('solana_recipient_token_account');
    }

    return { createTokenAccount: false, kind: 'token-account', tokenAccount: recipient };
  }

  if (recipientAccount && recipientAccount.owner !== SYSTEM_PROGRAM_ADDRESS) {
    throw new SolanaTransferError('solana_recipient_program');
  }

  // Off-curve addresses have no private key. Only an existing System account
  // (for example a funded multisig vault) is accepted as such a recipient.
  if (!recipientAccount && !isOnEd25519Curve(decodeSolanaPubkey(recipient, 'invalid_solana_recipient'))) {
    throw new SolanaTransferError('solana_recipient_off_curve');
  }

  if (asset.kind === 'native') return { createTokenAccount: false, kind: 'wallet', recipientExists: !!recipientAccount };

  const tokenAccountAddress = deriveAssociatedTokenAddress({
    mint: asset.token.mint,
    owner: recipient,
    tokenProgramId: asset.token.tokenProgramId,
  });
  const existing = await client.getAccountInfo(tokenAccountAddress);

  if (existing) {
    const tokenAccount = parseTokenAccount(existing);

    if (!tokenAccount || tokenAccount.mint !== asset.token.mint || tokenAccount.owner !== recipient) {
      throw new SolanaTransferError('solana_recipient_token_account');
    }
    if (tokenAccount.state !== 'initialized') throw new SolanaTransferError('solana_recipient_token_account_frozen');
  }

  return { createTokenAccount: !existing, kind: 'wallet-token-account', tokenAccount: tokenAccountAddress };
}

async function resolveComputeUnitPrice({
  client,
  quoted,
  writableAccounts,
}: {
  client: Pick<SolanaTransferClient, 'getRecentPrioritizationFees'>;
  quoted?: number;
  writableAccounts: string[];
}): Promise<number> {
  // The send never pays a higher priority fee than the user saw.
  if (quoted !== undefined) return clampComputeUnitPrice(quoted);

  try {
    const fees = (await client.getRecentPrioritizationFees([...new Set(writableAccounts)]))
      .map(({ prioritizationFee }) => prioritizationFee)
      .sort((left, right) => left - right);

    if (!fees.length) return SOLANA_DEFAULT_COMPUTE_UNIT_PRICE;

    return clampComputeUnitPrice(fees[Math.min(fees.length - 1, Math.floor(fees.length * SOLANA_PRIORITY_FEE_PERCENTILE))]);
  } catch {
    return SOLANA_DEFAULT_COMPUTE_UNIT_PRICE;
  }
}

function clampComputeUnitPrice(value: number): number {
  if (!Number.isFinite(value)) return SOLANA_DEFAULT_COMPUTE_UNIT_PRICE;

  return Math.min(SOLANA_MAX_COMPUTE_UNIT_PRICE, Math.max(SOLANA_MIN_COMPUTE_UNIT_PRICE, Math.ceil(value)));
}

function isTokenProgram(owner: string): boolean {
  return owner === SPL_TOKEN_PROGRAM_ADDRESS || owner === TOKEN_2022_PROGRAM_ADDRESS;
}

function parseTokenAccount(account: SolanaParsedAccount): { mint: string; owner: string; state: string } | null {
  const data = account.data as { parsed?: { info?: Record<string, unknown>; type?: string } } | undefined;
  const info = data?.parsed?.info;

  if (data?.parsed?.type !== 'account' || !info) return null;
  if (typeof info.mint !== 'string' || typeof info.owner !== 'string' || typeof info.state !== 'string') return null;

  return { mint: info.mint, owner: info.owner, state: info.state };
}

function createSolanaSystemTransferTransaction({
  computeBudget,
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
      ...createComputeBudgetInstructions(computeBudget),
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

function createComputeBudgetInstructions(computeBudget?: SolanaComputeBudget): LegacyInstruction[] {
  if (!computeBudget) return [];

  const limitData = new Uint8Array(5);
  const priceData = new Uint8Array(9);

  writeU8(limitData, 0, SOLANA_SET_COMPUTE_UNIT_LIMIT_INSTRUCTION);
  writeU32Le(limitData, 1, computeBudget.unitLimit);
  writeU8(priceData, 0, SOLANA_SET_COMPUTE_UNIT_PRICE_INSTRUCTION);
  writeU64Le(priceData, 1, BigInt(computeBudget.unitPriceMicroLamports));

  return [
    { accounts: [], data: limitData, programAddress: COMPUTE_BUDGET_PROGRAM_ADDRESS },
    { accounts: [], data: priceData, programAddress: COMPUTE_BUDGET_PROGRAM_ADDRESS },
  ];
}

function createSolanaSplTokenTransferTransaction({
  amount,
  computeBudget,
  createDestinationAccount = true,
  decimals,
  destinationTokenAccount,
  from,
  mint,
  recentBlockhash,
  sourceTokenAccount,
  toOwner,
  tokenProgramId,
}: SolanaSplTokenTransferPayload): Uint8Array {
  const destination = destinationTokenAccount ?? deriveAssociatedTokenAddress({ mint, owner: toOwner, tokenProgramId });
  const ataInstructionData = new Uint8Array([1]);
  const transferInstructionData = new Uint8Array(SOLANA_TOKEN_TRANSFER_CHECKED_DATA_LENGTH);

  assertSolanaTokenDecimals(decimals);
  writeU8(transferInstructionData, 0, SOLANA_TOKEN_TRANSFER_CHECKED_INSTRUCTION);
  writeU64Le(transferInstructionData, 1, amount);
  writeU8(transferInstructionData, 9, decimals);

  return createLegacySolanaTransaction({
    feePayer: from,
    instructions: [
      ...createComputeBudgetInstructions(computeBudget),
      ...(createDestinationAccount && !destinationTokenAccount
        ? [
            {
              accounts: [
                { address: from, isSigner: true, isWritable: true },
                { address: destination, isSigner: false, isWritable: true },
                { address: toOwner, isSigner: false, isWritable: false },
                { address: mint, isSigner: false, isWritable: false },
                { address: SYSTEM_PROGRAM_ADDRESS, isSigner: false, isWritable: false },
                { address: tokenProgramId, isSigner: false, isWritable: false },
              ],
              data: ataInstructionData,
              programAddress: ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
            },
          ]
        : []),
      {
        accounts: [
          { address: sourceTokenAccount, isSigner: false, isWritable: true },
          { address: mint, isSigner: false, isWritable: false },
          { address: destination, isSigner: false, isWritable: true },
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

/**
 * The user's selected or custom node first, then the registry nodes, then the
 * built-in public mainnet (or devnet) nodes, so one unavailable node never
 * blocks balances or a send.
 */
function getSolanaRpcUrls(network: NetworkJson): string[] {
  const selected = network.providers?.[network.currentProvider] ?? network.customProviders?.[network.currentProvider];
  const nodes = [...(network.customNodes ?? []), ...(network.nodes ?? [])].map(({ url }) => url);
  const candidates = [selected, ...nodes, ...UNIVERSAL_WALLET_SOLANA_RPC_FAILOVER_ENDPOINTS[getSolanaNetworkKind(network)]];

  return [...new Set(candidates.filter((url): url is string => typeof url === 'string' && isUsableRpcUrl(url)))];
}

function getSolanaRpcUrl(network: NetworkJson): string {
  return getSolanaRpcUrls(network)[0];
}

function isUsableRpcUrl(value: string): boolean {
  try {
    const url = new URL(value);

    return url.protocol === 'https:' || (url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1'));
  } catch {
    return false;
  }
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

function baseUnitsToDecimalString(value: bigint, decimals: number): string {
  if (value < 0n) throw new Error('invalid_solana_amount');
  if (decimals === 0) return value.toString();

  const multiplier = 10n ** BigInt(decimals);
  const fraction = (value % multiplier).toString().padStart(decimals, '0').replace(/0+$/u, '');

  return fraction ? `${(value / multiplier).toString()}.${fraction}` : (value / multiplier).toString();
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
  quote = false,
  source,
  state,
}: {
  amount: string;
  assetId?: string;
  networkKey: NetworkName;
  quote?: boolean;
  source: SolanaTransferSource;
  state: State;
}):
  | { amountBaseUnits?: bigint; kind: 'native' }
  | { amountBaseUnits?: bigint; kind: 'spl-token'; token: SolanaTokenTransferMetadata } {
  // A quote may be asked for before the user has typed an amount.
  const hasAmount = !quote || !/^\s*0*(?:\.0*)?\s*$/u.test(amount ?? '');

  if (isNativeSolanaAsset(assetId)) {
    return { amountBaseUnits: hasAmount ? solanaAmountToLamports(amount) : undefined, kind: 'native' };
  }

  const token = resolveStandardSplTokenTransferMetadata(state, source.accountAddress, networkKey, assetId!);

  return {
    amountBaseUnits: hasAmount ? solanaTokenAmountToBaseUnits(amount, token.decimals) : undefined,
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
    sourceAmount: /^\d+$/u.test(balance.solanaTokenSourceAmount ?? '') ? BigInt(balance.solanaTokenSourceAmount!) : undefined,
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
    rpcUrls: getSolanaRpcUrls(network),
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
  COMPUTE_BUDGET_PROGRAM_ADDRESS,
  SOLANA_COMPUTE_UNIT_LIMITS,
  SPL_TOKEN_PROGRAM_ADDRESS,
  SYSTEM_PROGRAM_ADDRESS,
  TOKEN_2022_PROGRAM_ADDRESS,
  createSolanaSplTokenTransferTransaction,
  createSolanaSystemTransferTransaction,
  createSolanaTransferClient,
  deriveAssociatedTokenAddress,
  estimateSolanaTransferFee,
  getSolanaNetworkKind,
  getSolanaRpcUrl,
  getSolanaRpcUrls,
  isOnEd25519Curve,
  isSolanaTransferNetwork,
  lamportsToSolString,
  makeSolanaTransfer,
  normalizeSolanaAddress,
  prepareSolanaTransferForTest,
  quoteSolanaTransfer,
  resolveSolanaTransferSource,
  solanaAmountToLamports,
  solanaTokenAmountToBaseUnits,
  type PreparedSolanaTransfer,
  type SolanaSendOptions,
  type SolanaTransferClient,
  type SolanaTransferParams,
  type SolanaTransferSource,
};
