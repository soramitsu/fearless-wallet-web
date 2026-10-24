import type { TransactionRequest } from 'ethers';

// JSON-RPC calls the reviewed gas limit `gas`; ethers accepts `gasLimit`.
// Passing `gas` straight through causes ethers to estimate a different limit.
export function evmTransaction(value: unknown): TransactionRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid EVM transaction');
  const tx = { ...value } as Record<string, unknown>;
  if (tx.gas !== undefined) {
    if (typeof tx.gas !== 'string' || !/^(?:0x[0-9a-fA-F]+|[0-9]+)$/.test(tx.gas))
      throw new Error('Invalid EVM gas limit');
    if (
      tx.gasLimit !== undefined &&
      (typeof tx.gasLimit !== 'string' ||
        !/^(?:0x[0-9a-fA-F]+|[0-9]+)$/.test(tx.gasLimit) ||
        BigInt(tx.gas) !== BigInt(tx.gasLimit))
    ) {
      throw new Error('Conflicting EVM gas limits');
    }
    tx.gasLimit = tx.gas;
    delete tx.gas;
  }
  return tx as TransactionRequest;
}
