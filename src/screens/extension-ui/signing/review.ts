import { formatUnits, getBytes, isAddress, toUtf8String } from 'ethers';
import type { SigningRequest } from '@extension-base/background/types/types';
import type { EvmRequestPayload, SolanaRequestPayload } from '@extension-base/services/request-service/types';
import type { NetworkJson } from '@extension-base/types';
import { evmMessageBytes } from '@/util/evmMessageBytes';
import { evmTransaction } from '@/util/evmTransaction';
import { evmTypedData } from '@/util/evmTypedData';
import { parseSolanaSerializedTransaction } from '@/util/solanaTransaction';

export type ReviewRequest = SigningRequest | EvmRequestPayload | SolanaRequestPayload;
export type ReviewAction = {
  transactionIndex?: number;
  kind: 'message' | 'transfer' | 'typedData' | 'unknown';
  text?: string;
  amount?: string;
  from?: string;
  to?: string;
  asset?: string;
  program?: string;
};
export type SigningReview = {
  protocol: 'Ethereum' | 'Solana' | 'Substrate';
  method: string;
  network?: string;
  networkIdentity?: string;
  fee?: string;
  feeKind: 'maximum' | 'estimate' | 'unavailable' | 'signOnly';
  actions: ReviewAction[];
  blind: boolean;
  blocked: boolean;
  raw: string;
};

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const quantity = (value: unknown): bigint => {
  if (typeof value !== 'string' || !/^(?:0x[0-9a-fA-F]+|[0-9]+)$/.test(value)) throw new Error('Invalid quantity');
  return BigInt(value);
};
// Controls that can conceal/reorder content are never presented as readable text.
const visibleText = (bytes: Uint8Array): string | undefined => {
  try {
    const text = toUtf8String(bytes);
    return text.length > 0 && !/[\p{Cc}\p{Cf}]/u.test(text.replace(/[\n\r\t]/g, '')) ? text : undefined;
  } catch {
    return undefined;
  }
};
export const reviewJson = (value: unknown): string =>
  (JSON.stringify(value, null, 2) ?? '').replace(
    /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`
  );

function evmReview(request: EvmRequestPayload, result: SigningReview): void {
  result.network = request.network?.name;
  result.networkIdentity = request.network?.chainId;
  if (!request.network?.chainId || !isAddress(request.account?.address ?? ''))
    throw new Error('Missing signing context');
  const params = request.data;
  if (!Array.isArray(params)) throw new Error('Invalid parameters');
  if (request.method === 'personal_sign' || request.method === 'eth_sign') {
    const text = visibleText(evmMessageBytes(request.method, params));
    result.actions = [{ kind: text === undefined ? 'unknown' : 'message', text }];
    result.blind = text === undefined;
    return;
  }
  if (request.method === 'eth_sendTransaction') {
    result.feeKind = 'unavailable';
    const tx = params[0];
    if (params.length !== 1 || !record(tx)) throw new Error('Invalid transaction');
    evmTransaction(tx); // Use the same gas-alias validation as the signer.
    const decimals = request.network.decimals;
    const knownUnit = Number.isInteger(decimals) && decimals! >= 0 && decimals! <= 255 && !!request.network.symbol;
    const amount = quantity(tx.value ?? '0x0');
    const to = typeof tx.to === 'string' ? tx.to : undefined;
    const emptyData = tx.data === undefined || tx.data === '0x';
    const simpleFields = [
      'from',
      'to',
      'value',
      'data',
      'nonce',
      'chainId',
      'gas',
      'gasLimit',
      'gasPrice',
      'maxFeePerGas',
      'maxPriorityFeePerGas',
      'type',
    ];
    const plainTransfer = emptyData && Object.keys(tx).every((key) => simpleFields.includes(key));
    result.actions = [
      {
        kind: plainTransfer && to && isAddress(to) ? 'transfer' : 'unknown',
        amount: knownUnit ? `${formatUnits(amount, decimals)} ${request.network.symbol}` : `${amount} wei`,
        from: request.account.address,
        to,
      },
    ];
    // Empty calldata can still execute receive/fallback code (including a
    // zero-value call that spends an existing token allowance). The current
    // request context has no authenticated destination-code/simulation result.
    // Keep the intended native value visible, but do not claim complete effects.
    if (plainTransfer && to && isAddress(to)) result.actions.push({ kind: 'unknown' });
    result.blind = true;
    const gas = tx.gas ?? tx.gasLimit;
    const price = tx.maxFeePerGas ?? tx.gasPrice;
    if (gas !== undefined && price !== undefined && knownUnit) {
      result.fee = `${formatUnits(quantity(gas) * quantity(price), decimals)} ${request.network.symbol}`;
      result.feeKind = 'maximum';
    }
    return;
  }
  if (request.method.startsWith('eth_signTypedData')) {
    const typed = evmTypedData(request.method, params);
    result.actions = [
      {
        kind: 'typedData',
        text: reviewJson({ domain: typed.domain, primaryType: typed.primaryType, message: typed.message }),
      },
    ];
    result.blind = false;
  }
}

const SYSTEM = '11111111111111111111111111111111';
const TOKEN = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const MEMO = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';

function solanaActions(serialized: string): ReviewAction[] {
  const parsed = parseSolanaSerializedTransaction(serialized);
  const actions: ReviewAction[] = [];
  for (const instruction of parsed.instructions) {
    const program = parsed.accountKeys[instruction.programIdIndex];
    const accounts = instruction.accountIndexes.map((index) => parsed.accountKeys[index]);
    const data = instruction.data;
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    if (
      program === SYSTEM &&
      accounts.length === 2 &&
      accounts.every(Boolean) &&
      data.length === 12 &&
      view.getUint32(0, true) === 2
    ) {
      actions.push({
        kind: 'transfer',
        from: accounts[0],
        to: accounts[1],
        amount: `${formatUnits(view.getBigUint64(4, true), 9)} SOL`,
        program,
      });
    } else if (
      program === TOKEN &&
      accounts.length === 4 &&
      accounts.every(Boolean) &&
      data.length === 10 &&
      data[0] === 12
    ) {
      // TransferChecked carries the mint and decimals; no ticker is inferred.
      actions.push({
        kind: 'transfer',
        from: accounts[0],
        to: accounts[2],
        asset: accounts[1],
        amount: formatUnits(view.getBigUint64(1, true), data[9]),
        program,
      });
    } else if (program === MEMO && visibleText(data) !== undefined) {
      actions.push({ kind: 'message', text: visibleText(data), program });
    } else actions.push({ kind: 'unknown', program });
  }
  // Lookup accounts cannot be resolved from transaction bytes alone.
  if (parsed.addressTableLookupCount || !actions.length) actions.push({ kind: 'unknown' });
  return actions;
}

function solanaReview(request: SolanaRequestPayload, result: SigningReview): void {
  if (request.method === 'signMessage') {
    if (
      !request.messageBase64 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(request.messageBase64)
    )
      throw new Error('Invalid message');
    const text = visibleText(Uint8Array.from(atob(request.messageBase64), (c) => c.charCodeAt(0)));
    result.actions = [{ kind: text === undefined ? 'unknown' : 'message', text }];
    result.blind = text === undefined;
    return;
  }
  // The current broadcast service explicitly uses mainnet. A sign-only payload
  // has no chain identifier, so it must not inherit the selected UI network.
  if (request.method === 'signAndSendTransaction') {
    result.network = 'Solana Mainnet';
    result.feeKind = 'unavailable';
    if (request.fee?.status === 'ready' && Number.isSafeInteger(request.fee.lamports) && request.fee.lamports! >= 0) {
      result.fee = `${formatUnits(request.fee.lamports!, 9)} SOL`;
      result.feeKind = 'estimate';
    }
  }
  const transactions =
    request.method === 'signAllTransactions' ? request.transactionsBase64 : [request.transactionBase64];
  if (!transactions?.length || transactions.some((value) => !value)) throw new Error('Missing transaction');
  result.actions = transactions.flatMap((value, transactionIndex) =>
    solanaActions(value!).map((action) => ({ ...action, transactionIndex: transactionIndex + 1 }))
  );
  result.blind = result.actions.some((action) => action.kind === 'unknown');
}

export function signingReview(request: ReviewRequest, networks: NetworkJson[] = []): SigningReview {
  const protocol = 'ecosystem' in request ? 'Solana' : 'data' in request ? 'Ethereum' : 'Substrate';
  const result: SigningReview = {
    protocol,
    method: 'method' in request ? request.method : 'signPayload',
    feeKind: 'signOnly',
    actions: [{ kind: 'unknown' }],
    blind: true,
    blocked: false,
    raw: '',
  };
  try {
    result.raw = reviewJson(
      'request' in request ? request.request.payload : 'data' in request ? request.data : request
    );
    if ('data' in request) evmReview(request, result);
    else if ('ecosystem' in request) solanaReview(request, result);
    else {
      const payload = request.request.payload;
      if ('data' in payload) {
        result.method = 'signRaw';
        const text = visibleText(getBytes(payload.data));
        result.actions = [{ kind: text === undefined ? 'unknown' : 'message', text }];
        result.blind = text === undefined;
      } else {
        result.networkIdentity = payload.genesisHash;
        result.network = networks.find(
          (entry) => entry.genesisHash.toLowerCase() === payload.genesisHash.toLowerCase()
        )?.name;
        result.actions = [{ kind: 'unknown', text: reviewJson(payload) }];
      }
    }
  } catch {
    result.blocked = true;
    result.blind = true;
  }
  return result;
}
