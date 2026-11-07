// JSON-RPC 2.0 messages, as the EIP-1193 provider and WalletConnect exchange them.

/* eslint-disable @typescript-eslint/no-explicit-any -- request parameters are whatever the caller's method takes */

export interface RequestArguments<T = any> {
  method: string;
  params?: T;
}

export interface JsonRpcRequest<T = any> {
  id: number;
  jsonrpc: string;
  method: string;
  params: T;
}

export interface JsonRpcErrorObject {
  code: number;
  message: string;
  data?: string;
}

export interface JsonRpcResult<T = any> {
  id: number;
  jsonrpc: string;
  result: T;
}

export interface JsonRpcError {
  id: number;
  jsonrpc: string;
  error: JsonRpcErrorObject;
}

export type JsonRpcResponse<T = any> = JsonRpcResult<T> | JsonRpcError;

export type JsonRpcPayload<P = any, R = any> = JsonRpcRequest<P> | JsonRpcResponse<R>;

/* eslint-enable @typescript-eslint/no-explicit-any */

/** JSON-RPC's code for an implementation-defined server error, used when only a message is known. */
export const JSON_RPC_SERVER_ERROR = -32000;

let lastPayloadId = 0;

/**
 * A request id: the time in milliseconds times 1000 plus three random digits, the form WalletConnect peers expect.
 * Ids from this worker only increase, so two requests in the same millisecond still differ.
 */
export function payloadId(now = Date.now()): number {
  const candidate = now * 1000 + Math.floor(Math.random() * 1000);

  lastPayloadId = candidate > lastPayloadId ? candidate : lastPayloadId + 1;

  return lastPayloadId;
}

export function formatJsonRpcRequest<T>(method: string, params: T, id = payloadId()): JsonRpcRequest<T> {
  return { id, jsonrpc: '2.0', method, params };
}

export function formatJsonRpcResult<T>(id: number, result: T): JsonRpcResult<T> {
  return { id, jsonrpc: '2.0', result };
}

/** An error response. A bare message gets the server-error code. */
export function formatJsonRpcError(id: number, error: string | JsonRpcErrorObject, data?: string): JsonRpcError {
  const body: JsonRpcErrorObject =
    typeof error === 'string' ? { code: JSON_RPC_SERVER_ERROR, message: error } : { code: error.code, message: error.message };

  if (data !== undefined) body.data = data;
  else if (typeof error !== 'string' && error.data !== undefined) body.data = error.data;

  return { id, jsonrpc: '2.0', error: body };
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasId = (value: Record<string, unknown>): boolean =>
  typeof value.id === 'number' && Number.isSafeInteger(value.id);

export function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
  return isObject(value) && hasId(value) && typeof value.method === 'string';
}

export function isJsonRpcResult(value: unknown): value is JsonRpcResult {
  return isObject(value) && hasId(value) && typeof value.method !== 'string' && 'result' in value;
}

export function isJsonRpcError(value: unknown): value is JsonRpcError {
  return (
    isObject(value) &&
    hasId(value) &&
    typeof value.method !== 'string' &&
    isObject(value.error) &&
    typeof value.error.code === 'number' &&
    typeof value.error.message === 'string'
  );
}

export function isJsonRpcResponse(value: unknown): value is JsonRpcResponse {
  return isJsonRpcResult(value) || isJsonRpcError(value);
}
