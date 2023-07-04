import { ethers, TransactionRequest } from 'ethers';
import {
  BasicTxResponse,
  ExternalRequestPromise,
  ExternalRequestPromiseStatus,
  TransferErrorCode,
} from '@extension-base/background/types/types';
import { getERC20Contract } from '@extension-base/api/evm/utils/eth';
import { state } from '../../background/handlers';

export type HandleBasicTx = (data: BasicTxResponse) => void;
export type HandleTxResponse<T extends BasicTxResponse> = (data: T) => void;

interface HandleTransferBalanceResultProps {
  callback: HandleBasicTx;
  changeValue: string;
  networkKey: string;
  receipt: ethers.TransactionReceipt;
  response: BasicTxResponse;
  updateState?: (promise: Partial<ExternalRequestPromise>) => void;
}

export const handleTransferBalanceResult = ({
  callback,
  changeValue,
  receipt,
  response,
  updateState,
}: HandleTransferBalanceResultProps) => {
  response.status = true;

  const fee = (receipt.gasUsed * receipt.gasPrice).toString();

  response.txResult = {
    change: changeValue || '0',
    fee,
  };

  updateState &&
    updateState({
      status: receipt.status ? ExternalRequestPromiseStatus.COMPLETED : ExternalRequestPromiseStatus.FAILED,
    });
  callback(response);
};

export async function handleTransfer(
  transactionObject: ethers.TransactionRequest,
  networkKey: string,
  privateKey: string,
  callback: (data: BasicTxResponse) => void
) {
  const web3Api = state.getEvmApiMap[networkKey];
  const signer = new ethers.Wallet(privateKey, web3Api);

  const response: BasicTxResponse = {
    errors: [],
  };

  try {
    const tx = await signer.sendTransaction({ ...transactionObject, value: ethers.parseUnits('0', 'ether') });
    response.callHash = tx.hash;
    response.status = true;
    response.txError = false;
    callback(response);
  } catch (error) {
    response.status = false;
    response.txError = true;
    response.errors?.push({
      code: TransferErrorCode.TRANSFER_ERROR,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/ban-ts-comment
      // @ts-ignore
      message: error.message,
    });
    callback(response);
  }
}

export async function getEVMTransactionObject(
  networkKey: string,
  to: string,
  value: string
): Promise<{ tx: ethers.TransactionRequest; value: string; fee: bigint }> {
  const web3Api = state.getEvmApiMap[networkKey];
  const { maxFeePerGas, maxPriorityFeePerGas, gasPrice } = await web3Api.getFeeData();

  const nonce = await web3Api.provider.getTransactionCount(to);
  const transactionObject = {
    maxFeePerGas,
    maxPriorityFeePerGas,
    nonce,
    to,
    value: ethers.parseEther(value),
  } as ethers.TransactionRequest;
  const gas = await web3Api.provider.estimateGas(transactionObject);
  transactionObject.gasLimit = gas;
  const prepGasPrice = gasPrice ?? BigInt(0);
  const estimateFee = prepGasPrice * gas;

  transactionObject.value = ethers.parseEther(value);

  return { tx: transactionObject, value: BigInt(0).toString(), fee: estimateFee };
}

export async function makeEVMTransfer(
  networkKey: string,
  to: string,
  privateKey: string,
  value: string,
  callback: (data: BasicTxResponse) => void
): Promise<void> {
  const { tx } = await getEVMTransactionObject(networkKey, to, value);

  await handleTransfer(tx, networkKey, privateKey, callback);
}

export async function getERC20TransactionObject(
  assetAddress: string,
  networkKey: string,
  from: string,
  to: string,
  value: string
): Promise<{ tx: ethers.TransactionRequest; value: string; fee: bigint }> {
  const web3Api = state.getEvmApiMap[networkKey];
  const erc20Contract = getERC20Contract(networkKey, assetAddress);

  function generateTransferData(to: string, transferValue: string): string {
    const value = ethers.parseUnits(transferValue, 6);

    return erc20Contract.interface.encodeFunctionData('transfer', [to, value]);
  }

  const transferData = generateTransferData(to, value);

  const transactionObject: TransactionRequest = {
    from,
    to: erc20Contract.target,
    data: transferData,
    value: ethers.parseUnits('0', 6),
  };

  const gasLimit = await web3Api.estimateGas(transactionObject);
  transactionObject.gasLimit = gasLimit;
  const { gasPrice } = await web3Api.getFeeData();
  const prepGasPrice = gasPrice ? gasPrice : BigInt(0);
  const estimateFee = prepGasPrice * gasLimit;

  return { tx: transactionObject, value, fee: estimateFee };
}

export async function makeERC20Transfer(
  assetAddress: string,
  networkKey: string,
  from: string,
  to: string,
  privateKey: string,
  value: string,
  callback: (data: BasicTxResponse) => void
) {
  const { tx } = await getERC20TransactionObject(assetAddress, networkKey, from, to, value);
  tx.value = ethers.parseUnits(value, 6);
  await handleTransfer(tx, networkKey, privateKey, callback);
}
