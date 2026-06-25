import { BehaviorSubject } from 'rxjs';
import { getId } from '@extension-base/utils';
import type { RequestService } from '@extension-base/services/request-service';
import type {
  SolanaRequestPayload,
  SolanaRequests,
  SolanaRequestsSubject,
  SolanaRequestsSubjectPayload,
  SolanaTransactionFeePreview,
  SolanaTransactionSimulationPreview,
  SolanaTransactionPreview,
} from '@extension-base/services/request-service/types';
import type { SolanaFeeForMessageResponse, SolanaSimulationResponse } from '@extension-base/services/solana-rpc-service';
import type {
  SolanaAccountInfo,
  SolanaSignAndSendTransactionOptions,
  SolanaSignAndSendTransactionRequest,
  SolanaSigningResponse,
  SolanaSignAllTransactionsRequest,
  SolanaSignMessageRequest,
  SolanaSignTransactionRequest,
} from '@extension-base/page/types';
import type { Resolver } from '@extension-base/background/types/types';
import {
  getSolanaSerializedMessageBase64,
  parseSolanaSerializedTransaction,
  SolanaTransactionError,
} from '@/util/solanaTransaction';

const BASE64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const MAX_SOLANA_SIGN_MESSAGE_BASE64_LENGTH = Math.ceil((64 * 1024) / 3) * 4;
const MAX_SOLANA_TRANSACTION_BASE64_LENGTH = Math.ceil((256 * 1024) / 3) * 4;
const MAX_SOLANA_TRANSACTION_BATCH = 16;
const MAX_SIMULATION_ERROR_LENGTH = 240;

type SimulateSolanaTransaction = (transactionBase64: string) => Promise<SolanaSimulationResponse>;
type EstimateSolanaTransactionFee = (messageBase64: string) => Promise<SolanaFeeForMessageResponse>;

export default class SolanaRequestHandler {
  private readonly solanaRequests: SolanaRequestsSubject = {};
  public readonly signSolanaSubject = new BehaviorSubject<SolanaRequests>({});

  constructor(private readonly requestService: RequestService) {}

  get numSolanaSignRequest(): number {
    return Object.keys(this.solanaRequests).length;
  }

  getSolanaSignRequest(id: string): SolanaRequestsSubjectPayload | undefined {
    return this.solanaRequests[id];
  }

  confirmSignMessage(
    url: string,
    request: SolanaSignMessageRequest,
    account: SolanaAccountInfo,
    id = getId()
  ): Promise<SolanaSigningResponse> {
    assertSolanaMessageRequest(request);

    const payload: SolanaRequestPayload = {
      account,
      display: request.display,
      ecosystem: 'solana',
      id,
      messageBase64: request.messageBase64,
      method: 'signMessage',
      origin: request.origin,
      url,
    };

    return this.confirmSign(payload, id);
  }

  confirmSignTransaction(
    url: string,
    request: SolanaSignTransactionRequest,
    account: SolanaAccountInfo,
    id = getId()
  ): Promise<SolanaSigningResponse> {
    assertSolanaTransactionRequest(request);

    return this.confirmSign(
      {
        account,
        ecosystem: 'solana',
        id,
        method: 'signTransaction',
        origin: request.origin,
        transactionBase64: request.transactionBase64,
        transactionPreview: previewSolanaTransaction(request.transactionBase64),
        url,
      },
      id
    );
  }

  confirmSignAndSendTransaction(
    url: string,
    request: SolanaSignAndSendTransactionRequest,
    account: SolanaAccountInfo,
    id = getId(),
    simulateTransaction?: SimulateSolanaTransaction,
    estimateFee?: EstimateSolanaTransactionFee
  ): Promise<SolanaSigningResponse> {
    const options = assertSolanaSignAndSendTransactionRequest(request);

    const signing = this.confirmSign(
      {
        account,
        ecosystem: 'solana',
        fee: estimateFee ? { status: 'pending' } : undefined,
        id,
        method: 'signAndSendTransaction',
        options,
        origin: request.origin,
        simulation: simulateTransaction ? { status: 'pending' } : undefined,
        transactionBase64: request.transactionBase64,
        transactionPreview: previewSolanaTransaction(request.transactionBase64),
        url,
      },
      id
    );

    if (simulateTransaction) {
      this.updateSignAndSendSimulation(id, request.transactionBase64, simulateTransaction).catch(console.error);
    }
    if (estimateFee) {
      this.updateSignAndSendFee(id, request.transactionBase64, estimateFee).catch(console.error);
    }

    return signing;
  }

  confirmSignAllTransactions(
    url: string,
    request: SolanaSignAllTransactionsRequest,
    account: SolanaAccountInfo,
    id = getId()
  ): Promise<SolanaSigningResponse> {
    assertSolanaAllTransactionsRequest(request);

    return this.confirmSign(
      {
        account,
        ecosystem: 'solana',
        id,
        method: 'signAllTransactions',
        origin: request.origin,
        transactionPreviews: request.transactionsBase64.map(previewSolanaTransaction),
        transactionsBase64: request.transactionsBase64,
        url,
      },
      id
    );
  }

  private publish(shouldClose?: boolean): void {
    this.signSolanaSubject.next(this.publicRequests);
    this.requestService.updateIcon(shouldClose);
  }

  private get publicRequests(): SolanaRequests {
    return Object.fromEntries(
      Object.entries(this.solanaRequests).map(([id, { reject: _reject, resolve: _resolve, ...request }]) => [
        id,
        request,
      ])
    );
  }

  private signComplete(
    id: string,
    resolve: (result: SolanaSigningResponse) => void,
    reject: (error: Error) => void
  ): Resolver<SolanaSigningResponse> {
    const complete = (): void => {
      delete this.solanaRequests[id];
      this.publish(true);
    };

    return {
      reject: (error: Error): void => {
        complete();
        reject(error);
      },
      resolve: (result: SolanaSigningResponse): void => {
        complete();
        resolve(result);
      },
    };
  }

  private confirmSign(payload: SolanaRequestPayload, id: string): Promise<SolanaSigningResponse> {
    return new Promise<SolanaSigningResponse>((resolve, reject): void => {
      this.solanaRequests[id] = {
        ...this.signComplete(id, resolve, reject),
        ...payload,
      };

      this.publish();
      this.requestService.popupOpen();
    });
  }

  private async updateSignAndSendSimulation(
    id: string,
    transactionBase64: string,
    simulateTransaction: SimulateSolanaTransaction
  ): Promise<void> {
    const update = (simulation: SolanaTransactionSimulationPreview): void => {
      const request = this.solanaRequests[id];

      if (!request) return;

      request.simulation = simulation;
      this.publish();
    };

    try {
      update(normalizeSimulationPreview(await simulateTransaction(transactionBase64)));
    } catch (error) {
      update({
        error: normalizeSimulationError(error),
        status: 'error',
      });
    }
  }

  private async updateSignAndSendFee(
    id: string,
    transactionBase64: string,
    estimateFee: EstimateSolanaTransactionFee
  ): Promise<void> {
    const update = (fee: SolanaTransactionFeePreview): void => {
      const request = this.solanaRequests[id];

      if (!request) return;

      request.fee = fee;
      this.publish();
    };

    try {
      update(normalizeFeePreview(await estimateFee(getSolanaSerializedMessageBase64(transactionBase64))));
    } catch (error) {
      update({
        error: normalizeSimulationError(error),
        status: 'error',
      });
    }
  }
}

function assertSolanaMessageRequest(request: SolanaSignMessageRequest): void {
  if (!request || typeof request !== 'object') throw new Error('Invalid Solana signing request');
  if (typeof request.origin !== 'string' || request.origin.trim().length === 0) {
    throw new Error('Invalid Solana request origin');
  }
  if (typeof request.messageBase64 !== 'string' || request.messageBase64.length === 0) {
    throw new Error('Invalid Solana message payload');
  }
  if (request.messageBase64.length > MAX_SOLANA_SIGN_MESSAGE_BASE64_LENGTH) {
    throw new Error('Solana message payload is too large');
  }
  if (!BASE64_RE.test(request.messageBase64)) throw new Error('Invalid Solana message payload');
  if (request.display !== undefined && request.display !== 'utf8' && request.display !== 'hex') {
    throw new Error('Invalid Solana message display mode');
  }
}

function assertSolanaTransactionRequest(request: SolanaSignTransactionRequest): void {
  assertSolanaOrigin(request?.origin);
  assertTransactionBase64(request?.transactionBase64);
}

function assertSolanaSignAndSendTransactionRequest(
  request: SolanaSignAndSendTransactionRequest
): SolanaSignAndSendTransactionOptions | undefined {
  assertSolanaOrigin(request?.origin);
  assertTransactionBase64(request?.transactionBase64);

  return normalizeSolanaSignAndSendOptions(request.options);
}

function assertSolanaAllTransactionsRequest(request: SolanaSignAllTransactionsRequest): void {
  assertSolanaOrigin(request?.origin);

  if (!Array.isArray(request.transactionsBase64) || request.transactionsBase64.length === 0) {
    throw new Error('Invalid Solana transaction batch');
  }
  if (request.transactionsBase64.length > MAX_SOLANA_TRANSACTION_BATCH) {
    throw new Error('Solana transaction batch is too large');
  }

  request.transactionsBase64.forEach(assertTransactionBase64);
}

function assertSolanaOrigin(origin: unknown): void {
  if (typeof origin !== 'string' || origin.trim().length === 0) {
    throw new Error('Invalid Solana request origin');
  }
}

function assertTransactionBase64(value: unknown): void {
  if (typeof value !== 'string' || value.length === 0) throw new Error('Invalid Solana transaction payload');
  if (value.length > MAX_SOLANA_TRANSACTION_BASE64_LENGTH) throw new Error('Solana transaction payload is too large');
  if (!BASE64_RE.test(value)) throw new Error('Invalid Solana transaction payload');
}

function previewSolanaTransaction(transactionBase64: string): SolanaTransactionPreview {
  const transactionBytes = getBase64ByteLength(transactionBase64);

  try {
    const parsed = parseSolanaSerializedTransaction(transactionBase64);

    return {
      accountCount: parsed.accountKeys.length,
      addressTableLookupCount: parsed.addressTableLookupCount,
      firstSigner: parsed.accountKeys[0],
      instructionCount: parsed.instructionCount,
      messageBytes: parsed.messageBytes.length,
      readonlySignedAccounts: parsed.readonlySignedAccounts,
      readonlyUnsignedAccounts: parsed.readonlyUnsignedAccounts,
      recentBlockhash: parsed.recentBlockhash,
      requiredSignatures: parsed.requiredSignatures,
      signatureCount: parsed.signatureCount,
      transactionBytes,
      version: parsed.version === 'legacy' ? 'legacy' : 'v0',
    };
  } catch (error) {
    return {
      parseError: error instanceof SolanaTransactionError ? error.code : 'invalid_transaction',
      transactionBytes,
    };
  }
}

function getBase64ByteLength(value: string): number {
  const normalized = value.replace(/=+$/, '');

  return Math.floor((normalized.length * 3) / 4);
}

function normalizeSimulationPreview(response: SolanaSimulationResponse): SolanaTransactionSimulationPreview {
  if (!isRecord(response) || !isRecord(response.context) || !isRecord(response.value)) {
    throw new Error('invalid_simulation_response');
  }
  if (!Number.isSafeInteger(response.context.slot) || response.value.err === undefined) {
    throw new Error('invalid_simulation_response');
  }

  const value = response.value;
  const error = value.err === null ? undefined : normalizeSimulationError(value.err);
  const logCount = Array.isArray(value.logs) ? value.logs.length : undefined;

  return {
    error,
    logCount,
    slot: response.context.slot,
    status: error ? 'failed' : 'success',
    unitsConsumed: value.unitsConsumed,
  };
}

function normalizeFeePreview(response: SolanaFeeForMessageResponse): SolanaTransactionFeePreview {
  if (!isRecord(response) || !isRecord(response.context) || response.value === undefined) {
    throw new Error('invalid_fee_response');
  }
  if (!Number.isSafeInteger(response.context.slot)) throw new Error('invalid_fee_response');
  if (response.value === null) {
    return {
      slot: response.context.slot,
      status: 'unavailable',
    };
  }
  if (!Number.isSafeInteger(response.value) || response.value < 0) throw new Error('invalid_fee_response');

  return {
    lamports: response.value,
    slot: response.context.slot,
    status: 'ready',
  };
}

function normalizeSimulationError(error: unknown): string {
  if (error instanceof Error) return truncateSimulationError(error.message || error.name);
  if (typeof error === 'string') return truncateSimulationError(error);

  try {
    return truncateSimulationError(JSON.stringify(error));
  } catch {
    return 'simulation_failed';
  }
}

function truncateSimulationError(value: string | undefined): string {
  if (!value) return 'simulation_failed';
  if (value.length <= MAX_SIMULATION_ERROR_LENGTH) return value;

  return `${value.slice(0, MAX_SIMULATION_ERROR_LENGTH)}...`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeSolanaSignAndSendOptions(
  options: SolanaSignAndSendTransactionOptions | undefined
): SolanaSignAndSendTransactionOptions | undefined {
  if (options === undefined) return undefined;
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new Error('Invalid Solana transaction broadcast options');
  }

  const normalized: SolanaSignAndSendTransactionOptions = {};

  if (options.maxRetries !== undefined) {
    if (!Number.isInteger(options.maxRetries) || options.maxRetries < 0 || options.maxRetries > 10) {
      throw new Error('Invalid Solana max retries');
    }
    normalized.maxRetries = options.maxRetries;
  }

  if (options.preflightCommitment !== undefined) {
    if (
      options.preflightCommitment !== 'processed' &&
      options.preflightCommitment !== 'confirmed' &&
      options.preflightCommitment !== 'finalized'
    ) {
      throw new Error('Invalid Solana preflight commitment');
    }
    normalized.preflightCommitment = options.preflightCommitment;
  }

  if (options.skipPreflight !== undefined) {
    if (typeof options.skipPreflight !== 'boolean') throw new Error('Invalid Solana skipPreflight option');
    normalized.skipPreflight = options.skipPreflight;
  }

  return normalized;
}
