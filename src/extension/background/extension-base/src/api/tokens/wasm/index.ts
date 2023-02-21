import { ApiPromise } from '@polkadot/api';
import { ContractPromise } from '@polkadot/api-contract';
import { PSP22Contract } from './helper';

export function getPSP22ContractPromise(apiPromise: ApiPromise, contractAddress: string) {
  return new ContractPromise(apiPromise, PSP22Contract, contractAddress);
}
