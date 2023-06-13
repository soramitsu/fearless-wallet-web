import { ethers } from 'ethers';

export enum ContractType {
  wasm = 'wasm',
  evm = 'evm',
}
export type EvmNetworkType = 'ethereum' | 'ethereum_goerli';
export type EvmTransaction = ethers.Transaction;
export type EvmUnsignedTransaction = ethers.UnsignedTransaction;
export type EvmSigner = ethers.Signer;
