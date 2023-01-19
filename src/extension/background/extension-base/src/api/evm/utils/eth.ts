import BigN from 'bignumber.js';
import { BN, hexStripPrefix, numberToHex, u8aToHex } from '@polkadot/util';
import BNEther from 'bn.js';
import RLP from 'rlp';
import { ethers } from 'ethers';
import { isEthereumAddress } from '@polkadot/util-crypto';
import { CustomTokenJson, NetworkJson } from '../types/ether';
import EthProvider from '../ethProvider';
import ERC20Contract from '../helpers/ERC20Contract.json';
import { DEFAULT_EVM_TOKENS } from '@/consts/networks';

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

export const signatureToHex = (sig: ethers.Transaction): string => {
  const v = sig.v;
  const r = hexStripPrefix(sig.r);
  const s = hexStripPrefix(sig.s);
  const hexR = r.length % 2 === 1 ? `0${r}` : r;
  const hexS = s.length % 2 === 1 ? `0${s}` : s;
  const hexV = hexStripPrefix(numberToHex(v));

  return hexR + hexS + hexV;
};

export function sumBN(inputArr: BN[]) {
  let rs = new BN(0);

  inputArr.forEach((input) => {
    rs = rs.add(input);
  });

  return rs;
}

export function initEvmTokenState(customTokenState: CustomTokenJson, networkMap: Record<string, NetworkJson>) {
  const evmTokenState = { erc20: customTokenState.erc20 };

  for (const defaultToken of DEFAULT_EVM_TOKENS.erc20) {
    let exist = false;

    for (const storedToken of evmTokenState.erc20) {
      if (
        isEqualContractAddress(defaultToken.smartContract, storedToken.smartContract) &&
        defaultToken.chain === storedToken.chain
      ) {
        if (storedToken.isCustom) {
          // if existed, migrate the custom token -> default token
          delete storedToken.isCustom;
        }

        exist = true;
        break;
      }
    }

    if (!exist) {
      evmTokenState.erc20.push(defaultToken);
    }
  }

  // Update networkKey in case networkMap change
  for (const token of evmTokenState.erc20) {
    if (!(token.chain in networkMap) && token.chain.startsWith('custom_')) {
      let newKey = '';
      const genesisHash = token.chain.split('custom_')[1]; // token from custom network has key with prefix custom_

      for (const [key, network] of Object.entries(networkMap)) {
        if (network.genesisHash.toLowerCase() === genesisHash.toLowerCase()) {
          newKey = key;
          break;
        }
      }

      token.chain = newKey;
    }
  }

  return evmTokenState;
}

export const getERC20Contract = (
  networkKey: string,
  assetAddress: string,
  web3ApiMap: Record<string, EthProvider>
): ethers.Contract => {
  return new ethers.Contract(assetAddress, ERC20Contract.abi, web3ApiMap[networkKey].provider);
};
