import { Interface, isError } from 'ethers';

/** Multicall3: deployed at the same address on every network that has it (eth_getCode tells). */
export const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11';
/** balanceOf calls in one aggregate3. A node that refuses one this large gets halves, down to the minimum. */
export const MULTICALL_CHUNK_SIZE = 400;
export const MULTICALL_MIN_CHUNK_SIZE = 50;

const multicall = new Interface([
  'function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[] returnData)',
]);
const erc20 = new Interface(['function balanceOf(address owner) view returns (uint256)']);

/** A token's balance, or undefined when its call failed (a reverting or non-standard contract): unknown, not zero. */
export type TokenBalances = Map<string, bigint | undefined>;

export function encodeBalanceCalls(owner: string, tokens: readonly string[]): string {
  const callData = erc20.encodeFunctionData('balanceOf', [owner]);

  return multicall.encodeFunctionData('aggregate3', [tokens.map((target) => ({ target, allowFailure: true, callData }))]);
}

export function decodeBalanceResults(data: string, count: number): (bigint | undefined)[] {
  const [results] = multicall.decodeFunctionResult('aggregate3', data) as unknown as [
    { success: boolean; returnData: string }[],
  ];

  if (results.length !== count) throw new Error('multicall_result_count');

  return results.map(({ success, returnData }) =>
    success && returnData.length >= 66 ? BigInt(returnData.slice(0, 66)) : undefined
  );
}

const messageOf = (error: unknown): string =>
  [
    error instanceof Error ? error.message : String(error),
    (error as { info?: { error?: { message?: unknown } } })?.info?.error?.message,
    (error as { error?: { message?: unknown } })?.error?.message,
  ]
    .filter(Boolean)
    .join(' ');

/**
 * Whether a refused aggregate3 may answer in smaller parts: it reverted (out of gas, a step limit), or the node found
 * the request or its answer too large. A node that is down, slow or rate limiting is not asked again.
 */
export function isSplittableMulticallError(error: unknown): boolean {
  const message = messageOf(error);

  if (/rate.?limit|too many requests|\b429\b/iu.test(message)) return false;

  return (
    isError(error, 'CALL_EXCEPTION') ||
    /too large|too big|exceed|out of gas|gas (?:limit|required)|request entity|payload|response size|\b413\b|counters/iu.test(message)
  );
}

interface ReadBalancesOptions {
  /** Runs one eth_call of the given aggregate3 data on the network's node and returns its answer. */
  call: (data: string) => Promise<string>;
  owner: string;
  tokens: readonly string[];
  chunkSize?: number;
  minChunkSize?: number;
}

/**
 * The balance of `owner` in each token, read through Multicall3 a chunk at a time. Throws when a chunk cannot be read
 * at all, so a scan that could not finish is never taken for one that found nothing.
 */
export async function readTokenBalancesWithMulticall({
  call,
  owner,
  tokens,
  chunkSize = MULTICALL_CHUNK_SIZE,
  minChunkSize = MULTICALL_MIN_CHUNK_SIZE,
}: ReadBalancesOptions): Promise<TokenBalances> {
  const balances: TokenBalances = new Map();
  const read = async (chunk: readonly string[]): Promise<void> => {
    try {
      const values = decodeBalanceResults(await call(encodeBalanceCalls(owner, chunk)), chunk.length);

      chunk.forEach((token, index) => balances.set(token.toLowerCase(), values[index]));
    } catch (error) {
      if (chunk.length <= minChunkSize || !isSplittableMulticallError(error)) throw error;

      const half = Math.ceil(chunk.length / 2);

      await read(chunk.slice(0, half));
      await read(chunk.slice(half));
    }
  };

  for (let start = 0; start < tokens.length; start += chunkSize) {
    await read(tokens.slice(start, start + chunkSize));
  }

  return balances;
}

interface ReadDirectOptions {
  /** Runs one eth_call to `to` with `data` and returns its answer. */
  call: (to: string, data: string) => Promise<string>;
  owner: string;
  tokens: readonly string[];
}

/**
 * The balance of `owner` in each token, one call each: for a network without Multicall3. ethers sends calls made
 * together over HTTP as one batch. Throws only when no call was answered.
 */
export async function readTokenBalancesDirectly({ call, owner, tokens }: ReadDirectOptions): Promise<TokenBalances> {
  const data = erc20.encodeFunctionData('balanceOf', [owner]);
  const results = await Promise.allSettled(tokens.map((token) => call(token, data)));
  const balances: TokenBalances = new Map();

  results.forEach((result, index) => {
    const value = result.status === 'fulfilled' && result.value.length >= 66 ? BigInt(result.value.slice(0, 66)) : undefined;

    balances.set(tokens[index].toLowerCase(), value);
  });

  const failed = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');

  if (tokens.length && failed && results.every(({ status }) => status === 'rejected')) throw failed.reason;

  return balances;
}
