import { accessListify, getAddress, Transaction } from 'ethers';
import type { AccessList, TransactionLike } from 'ethers';
import { evmTransaction } from '@/util/evmTransaction';

type QuantityField = 'nonce' | 'gasLimit' | 'gasPrice' | 'maxFeePerGas' | 'maxPriorityFeePerGas' | 'type';
export interface MobileTransactionIntent {
  from: string;
  to: string | null;
  chainId: bigint;
  value: bigint;
  data: string;
  quantities: Partial<Record<QuantityField, bigint>>;
  accessList: AccessList;
}

function quantity(value: unknown): bigint {
  if (
    (typeof value !== 'string' && typeof value !== 'number') ||
    (typeof value === 'number' && !Number.isSafeInteger(value)) ||
    !/^(?:0x[0-9a-fA-F]+|[0-9]+)$/.test(String(value))
  )
    throw new Error('Invalid mobile transaction quantity');
  const parsed = BigInt(value);
  if (parsed < 0n || parsed >= 2n ** 256n) throw new Error('Invalid mobile transaction quantity');
  return parsed;
}

// Capture only transaction formats whose signed fields can be compared exactly.
// Unsupported extensions reject before the mobile wallet can broadcast them.
export function captureMobileTransactionIntent(
  params: unknown,
  address: string,
  chainId: string
): MobileTransactionIntent {
  if (!Array.isArray(params) || params.length !== 1) throw new Error('Invalid mobile transaction parameters');
  const tx = evmTransaction(params[0]);
  const allowed = [
    'from',
    'to',
    'chainId',
    'value',
    'data',
    'nonce',
    'gasLimit',
    'gasPrice',
    'maxFeePerGas',
    'maxPriorityFeePerGas',
    'type',
    'accessList',
  ];
  if (Object.keys(tx).some((key) => !allowed.includes(key))) throw new Error('Unsupported mobile transaction fields');
  if (typeof tx.from !== 'string' || getAddress(tx.from) !== getAddress(address))
    throw new Error('Mobile transaction account does not match');
  const chain = quantity(chainId);
  if (tx.chainId !== undefined && quantity(tx.chainId) !== chain)
    throw new Error('Mobile transaction chain does not match');
  if (tx.to !== undefined && tx.to !== null && typeof tx.to !== 'string')
    throw new Error('Invalid mobile transaction recipient');
  const to = tx.to == null ? null : getAddress(tx.to as string);
  const data = tx.data === undefined ? '0x' : tx.data;
  if (typeof data !== 'string' || !/^0x(?:[0-9a-fA-F]{2})*$/.test(data))
    throw new Error('Invalid mobile transaction data');
  const quantities: MobileTransactionIntent['quantities'] = {};
  for (const field of ['nonce', 'gasLimit', 'gasPrice', 'maxFeePerGas', 'maxPriorityFeePerGas', 'type'] as const) {
    if (tx[field] !== undefined) quantities[field] = quantity(tx[field]);
  }
  const { type, nonce, gasPrice, maxFeePerGas, maxPriorityFeePerGas } = quantities;
  if (type !== undefined && type > 2n) throw new Error('Unsupported mobile transaction type');
  if (nonce !== undefined && nonce > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error('Invalid mobile transaction nonce');
  if (gasPrice !== undefined && (maxFeePerGas !== undefined || maxPriorityFeePerGas !== undefined || type === 2n))
    throw new Error('Conflicting mobile transaction fees');
  if ((type === 0n || type === 1n) && (maxFeePerGas !== undefined || maxPriorityFeePerGas !== undefined))
    throw new Error('Conflicting mobile transaction fees');
  if (maxFeePerGas !== undefined && maxPriorityFeePerGas !== undefined && maxPriorityFeePerGas > maxFeePerGas)
    throw new Error('Invalid mobile transaction fee cap');
  if (tx.accessList === null) throw new Error('Invalid mobile transaction access list');
  const accessList = tx.accessList === undefined ? [] : accessListify(tx.accessList);
  if (type === 0n && accessList.length) throw new Error('Legacy transaction cannot carry an access list');
  return {
    from: getAddress(address),
    to,
    chainId: chain,
    value: tx.value === undefined ? 0n : quantity(tx.value),
    data: data.toLowerCase(),
    quantities,
    accessList,
  };
}

export function assertMobileTransactionResult(
  intent: MobileTransactionIntent,
  hash: string,
  response: TransactionLike<string> | null
): void {
  if (!response) throw new Error('Mobile transaction evidence is unavailable; submission may already have occurred');
  // Reconstruct the signed envelope. The RPC's claimed hash/from alone are not proof.
  const reconstructed = Transaction.from(response);
  // RPC responses may include unsigned convenience fields (notably effective
  // gasPrice on type2). Compare only fields decoded from the signed envelope.
  const tx = Transaction.from(reconstructed.serialized);
  if (
    !tx.isSigned() ||
    tx.hash?.toLowerCase() !== hash.toLowerCase() ||
    tx.from !== intent.from ||
    tx.chainId !== intent.chainId
  )
    throw new Error('Mobile transaction signature or identity does not match');
  if (tx.type > 2 || tx.to !== intent.to || tx.value !== intent.value || tx.data.toLowerCase() !== intent.data)
    throw new Error('Mobile transaction differs from the reviewed request');
  if (intent.quantities.gasPrice !== undefined && tx.type !== 0 && tx.type !== 1)
    throw new Error('Mobile transaction fee model differs from the reviewed request');
  for (const [field, expected] of Object.entries(intent.quantities)) {
    const actual = tx[field as QuantityField];
    if (actual === null || BigInt(actual) !== expected)
      throw new Error('Mobile transaction differs from the reviewed request');
  }
  if (JSON.stringify(tx.accessList ?? []) !== JSON.stringify(intent.accessList))
    throw new Error('Mobile transaction access list differs from the reviewed request');
}
