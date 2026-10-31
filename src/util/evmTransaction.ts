import type { TransactionRequest } from 'ethers';

// JSON-RPC calls the reviewed gas limit `gas`; ethers accepts `gasLimit`.
// Passing `gas` straight through causes ethers to estimate a different limit.
// JSON-RPC also calls the calldata `input`; ethers reads only `data` and would
// sign the transaction without it. `input` stays on the copy, so a check of the
// fields a request may carry still sees it.
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
  if (tx.input !== undefined) {
    if (typeof tx.input !== 'string' || !/^0x(?:[0-9a-fA-F]{2})*$/.test(tx.input))
      throw new Error('Invalid EVM calldata');
    if (tx.data !== undefined && (typeof tx.data !== 'string' || tx.data.toLowerCase() !== tx.input.toLowerCase()))
      throw new Error('Conflicting EVM calldata');
    tx.data = tx.input;
  }
  return tx as TransactionRequest;
}
