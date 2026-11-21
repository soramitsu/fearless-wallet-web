import { captureWalletResetGuard, WalletResetContextChanged } from '@extension-base/api/walletResetGuard';
import { type TransactionRequest, Transaction, Wallet, getAddress, isError, parseEther, parseUnits } from 'ethers';
import { type BasicTxResponse, type EvmProvider, TransferErrorCode } from '@extension-base/background/types/types';
import { state } from '@extension-base/background/handlers';
import { type BalanceItem } from '@extension-base/api/evm/types';
import type State from '@extension-base/background/handlers/State';
import { withTimeout } from '@/util/endpointFailover';

export type HandleBasicTx = (data: BasicTxResponse) => void;

interface TransferParams {
  balance: BalanceItem;
  networkKey: string;
  from: string;
  to: string;
  amount: string;
}

interface TransactionObject {
  tx: TransactionRequest;
  fee: bigint;
}

interface MakeTransferParams extends TransferParams {
  privateKey: string;
  /**
   * The network fee the Send screen showed, in the native coin. It is a ceiling, as for Bitcoin, Solana and Iroha:
   * fee data the node returns at send time cannot raise what the transfer may cost.
   */
  approvedMaxFee?: string;
  finalGuard?: () => void;
  callback?: (data: BasicTxResponse) => void;
}

export interface HandleTransferProps extends MakeTransferParams {
  tx: TransactionRequest;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The most this transaction can pay in network fees: its gas limit at the highest gas price it allows. */
export function maximumEvmNetworkFee({ gasLimit, gasPrice, maxFeePerGas }: Pick<Transaction, 'gasLimit' | 'gasPrice' | 'maxFeePerGas'>): bigint {
  const price = maxFeePerGas ?? gasPrice;

  if (price === null || price === undefined || gasLimit <= 0n) throw new Error('transfer_fee_unavailable');

  return gasLimit * price;
}

// How long a send waits for the node's answer. Without one the transaction is looked for EVM_SEND_LOOKUPS times,
// EVM_SEND_LOOKUP_INTERVAL_MS apart: about ten seconds.
const EVM_SEND_TIMEOUT_MS = 30_000;
const EVM_SEND_LOOKUPS = 4;
const EVM_SEND_LOOKUP_INTERVAL_MS = 2_500;

// The node has the transaction already, or its nonce is used, maybe by this very transaction. Geth and Erigon say
// "already known" and "nonce too low", Besu "Known transaction", Nethermind "AlreadyKnown" and "OldNonce".
const KNOWN_TRANSACTION_ANSWER =
  /already ?known|(?<!un)known ?transaction|already ?imported|already ?exists|nonce ?(?:is ?)?too ?low|old ?nonce|nonce ?(?:has ?)?already ?(?:been ?)?used/iu;
// The node, or a gateway in front of it, was too busy to say whether it took the transaction.
const BUSY_ANSWER = /rate ?limit|rate exceeded|too many requests?|request limit|capacity|timeout|timed out|internal error/iu;
const BUSY_ANSWER_CODES: ReadonlySet<unknown> = new Set([429, -32005, -32603]);
// ethers raises these for a node's JSON-RPC error answer, and keeps the answer's error object on them.
const NODE_ANSWER_ERROR_CODES: ReadonlySet<unknown> = new Set([
  'INSUFFICIENT_FUNDS',
  'NONCE_EXPIRED',
  'REPLACEMENT_UNDERPRICED',
  'UNSUPPORTED_OPERATION',
  'UNKNOWN_ERROR',
]);

/** The error object the node answered with. A request that got no answer (network, HTTP status, timeout) has none. */
function nodeErrorAnswer(error: unknown): { code?: unknown; message: string } | undefined {
  if (!error || typeof error !== 'object' || !NODE_ANSWER_ERROR_CODES.has((error as { code?: unknown }).code)) return;

  const { error: answer, info } = error as { error?: unknown; info?: { error?: unknown; info?: { error?: unknown } } };

  return [answer, info?.error, info?.info?.error].find(
    (value): value is { code?: unknown; message: string } =>
      !!value && typeof value === 'object' && typeof (value as { message?: unknown }).message === 'string'
  );
}

/** Whether the node answered that it does not take the transaction. Any other failure may come after it did. */
function isNodeRefusal(error: unknown): boolean {
  const answer = nodeErrorAnswer(error);

  if (!answer || isError(error, 'NONCE_EXPIRED') || BUSY_ANSWER_CODES.has(answer.code)) return false;

  return !KNOWN_TRANSACTION_ANSWER.test(answer.message) && !BUSY_ANSWER.test(answer.message);
}

/** Whether the network has the transaction. Asked of its current provider: the one that sent may be destroyed. */
async function findSentTransaction(networkKey: string, hash: string): Promise<boolean> {
  for (let lookup = 1; ; lookup++) {
    // Lookups start EVM_SEND_LOOKUP_INTERVAL_MS apart, however long each one takes.
    const next = lookup < EVM_SEND_LOOKUPS && new Promise((resolve) => setTimeout(resolve, EVM_SEND_LOOKUP_INTERVAL_MS));

    try {
      const api = state.getEvmApi(networkKey)?.api;
      const found: unknown = api
        ? await withTimeout(
            api.send('eth_getTransactionByHash', [hash]),
            EVM_SEND_LOOKUP_INTERVAL_MS,
            () => new Error('evm_lookup_timeout')
          )
        : null;

      if (found && typeof found === 'object' && String((found as { hash?: unknown }).hash).toLowerCase() === hash) {
        return true;
      }
    } catch (error) {
      console.warn(error);
    }

    if (!next) return false;

    await next;
  }
}

/**
 * Sends a signed transaction with eth_sendRawTransaction alone and says whether the node answered with its hash; throws
 * only when the node refused it. ethers' broadcastTransaction also waited for the block number and chain ID, so a
 * failure of either, or a provider replaced meanwhile, reported a send the node had taken as failed, and sending again
 * paid twice.
 */
async function submitEvmTransaction(api: EvmProvider, serialized: string, hash: string): Promise<boolean> {
  try {
    const answer: unknown = await withTimeout(
      api.send('eth_sendRawTransaction', [serialized]),
      EVM_SEND_TIMEOUT_MS,
      () => new Error('evm_send_timeout')
    );

    if (typeof answer === 'string' && answer.toLowerCase() === hash) return true;

    console.warn('Unexpected eth_sendRawTransaction answer', answer);
  } catch (error) {
    if (isNodeRefusal(error)) throw error;

    console.warn(error);
  }

  return false;
}

/** Sends a signed transaction and says whether the network has it; throws only when the node refused it. */
async function sendEvmTransaction(api: EvmProvider, networkKey: string, serialized: string, hash: string): Promise<boolean> {
  return (await submitEvmTransaction(api, serialized, hash)) || findSentTransaction(networkKey, hash);
}

/**
 * Sends a transaction a site asked for and returns its hash. Only the node's refusal throws: after any other failure
 * the network may have the transaction, and a site told it failed may send it again with a fresh nonce.
 */
export async function sendDappEvmTransaction(api: EvmProvider, signed: string): Promise<string> {
  const hash = Transaction.from(signed).hash!;

  await submitEvmTransaction(api, signed, hash);

  return hash;
}

export async function handleTransfer({
  callback,
  networkKey,
  privateKey,
  tx,
  finalGuard,
  approvedMaxFee,
}: HandleTransferProps): Promise<void> {
  const web3Api = state.getEvmApi(networkKey)?.api;
  const signer = new Wallet(privateKey, web3Api);

  try {
    finalGuard?.();
    const populated = await signer.populateTransaction(tx);
    // populateTransaction resolves names, nonce, fees and chain ID. Signing
    // those resolved fields synchronously keeps reset from entering an extra
    // promise gap inside Wallet.signTransaction before the crypto operation.
    const { from, ...unsigned } = populated;
    if (from != null && getAddress(from) !== signer.address) throw new Error('Transaction from address mismatch');
    const transaction = Transaction.from(unsigned);
    if (approvedMaxFee !== undefined && maximumEvmNetworkFee(transaction) > parseEther(approvedMaxFee))
      throw new Error('transfer_fee_changed');
    const digest = transaction.unsignedHash;
    finalGuard?.();
    transaction.signature = signer.signingKey.sign(digest);
    finalGuard?.();
    if (!web3Api) throw new Error(`Unknown network ${networkKey}`);
    const transactionHash = transaction.hash!;

    if (!(await sendEvmTransaction(web3Api, networkKey, transaction.serialized, transactionHash))) {
      // The network may still take it: the Send screen shows the hash to check before sending again.
      callback?.({
        status: false,
        outcome: 'unknown',
        transactionHash,
        errors: [{ code: TransferErrorCode.TRANSFER_ERROR, message: 'evm_broadcast_ambiguous' }],
      });

      return;
    }

    callback?.({ status: true });
  } catch (error: unknown) {
    if (error instanceof WalletResetContextChanged) throw error;
    console.warn(error);

    callback?.({
      status: false,
      errors: [
        {
          code: TransferErrorCode.TRANSFER_ERROR,
          message: getErrorMessage(error),
        },
      ],
    });
  }
}

export function calcEvmFees(maxFee: bigint | null, baseFee: bigint | null | undefined, gasLimit: bigint): bigint {
  const baseFeePerGas = baseFee ?? BigInt(0);
  const maxFeePerGasPrep = maxFee ?? BigInt(0);
  const prepGasPrice = maxFeePerGasPrep + baseFeePerGas;

  return prepGasPrice * gasLimit;
}

async function getUtilityTransactionObject(params: TransferParams, forQuote = false): Promise<TransactionObject> {
  const { networkKey, from, to, amount } = params;
  const web3Api = state.getEvmApi(networkKey)?.api;

  if (!web3Api) throw new Error(`Unknown network ${networkKey}`);

  const { maxFeePerGas, maxPriorityFeePerGas, gasPrice } = await web3Api.getFeeData();
  const value = parseEther(amount);

  const transactionObject: TransactionRequest = {
    to,
    maxFeePerGas,
    maxPriorityFeePerGas,
    value,
  } as TransactionRequest;

  // A contract recipient's gas depends on the sender and the value it receives. Without fee fields a node does not cap
  // the estimate at what the balance pays after the value, which would leave nothing for Max.
  const gasLimit = await web3Api.provider.estimateGas({ from, to, value }).catch((error: unknown) => {
    // The Send screen also prices 1 coin before an amount is entered, and amounts above the balance: such a quote
    // prices a zero-value transfer. A send only signs a gas limit estimated for its own value.
    if (!forQuote) throw error;

    console.info(error);

    return web3Api.provider.estimateGas({ from, to });
  });
  const block = await web3Api.provider.getBlock('latest');

  const estimateFee = calcEvmFees(maxFeePerGas ?? gasPrice, block?.baseFeePerGas, gasLimit);

  transactionObject.gasLimit = gasLimit;

  return { tx: transactionObject, fee: estimateFee };
}

async function getERC20TransactionObject(params: TransferParams, state: State): Promise<TransactionObject> {
  const { balance, networkKey, to, from, amount } = params;
  const contractAddress = balance.id;
  const web3Api = state.getEvmApi(networkKey)?.api;

  const erc20Contract = await state.evmContractService.getContract(contractAddress, web3Api);

  const parsedValue = parseUnits(amount, balance.precision);
  const data = erc20Contract.interface.encodeFunctionData('transfer', [to, parsedValue]);

  if (!web3Api) throw new Error(`${networkKey} API not found`);

  const { maxFeePerGas, gasPrice } = await web3Api.getFeeData();
  const block = await web3Api.provider.getBlock('latest');

  const transactionObject: TransactionRequest = {
    to: contractAddress,
    from,
    data,
  };

  // A transfer the node cannot estimate is not quoted or sent: a gas limit estimated without its call data runs out of
  // gas on chain and costs the fee.
  const gasLimit = await web3Api.estimateGas(transactionObject);

  const estimateFee = calcEvmFees(maxFeePerGas ?? gasPrice, block?.baseFeePerGas, gasLimit);

  transactionObject.gasLimit = gasLimit;
  transactionObject.maxFeePerGas = maxFeePerGas;

  return { tx: transactionObject, fee: estimateFee };
}

async function makeUtilityTransfer(params: MakeTransferParams): Promise<void> {
  const { tx } = await getUtilityTransactionObject(params);

  return handleTransfer({ ...params, tx });
}

async function makeERC20Transfer(params: MakeTransferParams, state: State) {
  const { tx } = await getERC20TransactionObject(params, state);

  return handleTransfer({ ...params, tx });
}

export function getEVMTransactionObject(params: TransferParams, state: State): Promise<TransactionObject> {
  if (params.balance.isUtility) return getUtilityTransactionObject(params, true);

  return getERC20TransactionObject(params, state);
}

// How long a fee quote waits for the node before its provider is rebuilt and the quote asked once more.
export const EVM_QUOTE_TIMEOUT_MS = 10_000;

export class EvmQuoteTimeoutError extends Error {
  constructor() {
    super('evm_quote_timeout');
  }
}

const quoteWithin = (params: TransferParams, state: State) =>
  withTimeout(getEVMTransactionObject(params, state), EVM_QUOTE_TIMEOUT_MS, () => new EvmQuoteTimeoutError());

/**
 * Prices a transfer within a bounded time. A node that does not answer is asked once more through a rebuilt provider:
 * a request written to a socket the node has closed is never answered, and the Send screen would wait on it forever.
 */
export async function quoteEVMTransfer(params: TransferParams, state: State): Promise<TransactionObject> {
  try {
    return await quoteWithin(params, state);
  } catch (error) {
    if (!(error instanceof EvmQuoteTimeoutError)) throw error;

    state.networkService.evmApiHandler.rebuildApi(params.networkKey);

    return quoteWithin(params, state);
  }
}

export async function makeEVMTransfer(params: MakeTransferParams, state: State): Promise<void> {
  const resetGuard = captureWalletResetGuard(state);
  const callerGuard = params.finalGuard;
  params = { ...params, finalGuard: () => { resetGuard(); callerGuard?.(); } };
  const transfer = params.balance.isUtility ? makeUtilityTransfer(params) : makeERC20Transfer(params, state);

  return transfer.finally(() => {
    setTimeout(() => {
      state.balanceService.evmBalanceService.fetchBalance({
        ethereumAddress: params.from,
        assetId: params.balance.id,
        force: true,
        networks: [params.networkKey],
      });
    }, 8000);
  });
}
