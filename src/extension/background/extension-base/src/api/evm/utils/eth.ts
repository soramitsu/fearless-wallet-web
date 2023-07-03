import BigN from 'bignumber.js';
import { u8aToHex } from '@polkadot/util';
import BNEther from 'bn.js';
import RLP from 'rlp';
import { ethers, Contract } from 'ethers';
import { isEthereumAddress } from '@polkadot/util-crypto';
import ERC20Contract from '@extension-base/api/evm/helpers/ERC20Contract.json';
import { state } from '@extension-base/background/handlers';

export function isEqualContractAddress(address1: string, address2: string) {
  if (isEthereumAddress(address1) && isEthereumAddress(address2)) {
    return address1.toLowerCase() === address2.toLowerCase(); // EVM address is case-insensitive
  }

  return address2 === address1;
}

const hexToNumberString = (s: string): string => {
  const temp = parseInt(s, 16);

  if (isNaN(temp)) {
    return '0';
  } else {
    return temp.toString();
  }
};

export class Transaction {
  readonly nonce: string;
  readonly gasPrice: string;
  readonly gas: string;
  readonly action: string;
  readonly value: string;
  readonly data: string;
  readonly ethereumChainId: string;
  readonly isSafe: boolean;

  constructor(
    nonce: string,
    gasPrice: string,
    gas: string,
    action: string,
    value: string,
    data: string,
    ethereumChainId: string
  ) {
    this.nonce = hexToNumberString(nonce);
    this.gasPrice = hexToNumberString(gasPrice);
    this.gas = hexToNumberString(gas);
    this.action = action;
    this.value = hexToNumberString(value);
    this.data = data || '';
    this.ethereumChainId = parseInt(ethereumChainId, 16).toString();
    this.isSafe = true;
  }
}

export const anyNumberToBN = (value?: string | number | BNEther): BigN => {
  if (typeof value === 'string' || typeof value === 'number') {
    return new BigN(value);
  } else if (typeof value === 'undefined') {
    return new BigN(0);
  } else {
    return new BigN(value.toNumber());
  }
};

export const rlpItem = (rlp: string, position: number) => {
  const decodeArr = RLP.decode(rlp);
  const u8a = (decodeArr as Uint8Array[])[position] || [0];

  return u8aToHex(u8a);
};

export const createTransactionFromRLP = (rlp: string): Transaction | null => {
  try {
    const nonce = rlpItem(rlp, 0);
    const gasPrice = rlpItem(rlp, 1);
    const gas = rlpItem(rlp, 2);
    const action = rlpItem(rlp, 3);
    const value = rlpItem(rlp, 4);
    const data = rlpItem(rlp, 5);
    const ethereumChainId = rlpItem(rlp, 6);

    return new Transaction(nonce, gasPrice, gas, action, value, data, ethereumChainId);
  } catch (e) {
    console.info((e as Error).message);

    return null;
  }
};

export const getERC20Contract = (networkKey: string, assetAddress: string): ethers.Contract => {
  return new Contract(assetAddress, ERC20Contract.abi, state.getEvmApiMap[networkKey].provider);
};
