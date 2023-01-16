import { ethers } from 'ethers';

export enum ContractType {
  wasm = 'wasm',
  evm = 'evm',
}
export type EvmNetworkType = 'homestead' | 'goerli';
export type EvmTransaction = ethers.Transaction;
export type EvmUnsignedTransaction = ethers.UnsignedTransaction;
export type EvmSigner = ethers.Signer;
