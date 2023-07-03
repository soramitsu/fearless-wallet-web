import { ethers } from 'ethers';
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
  changeValue: string,
  networkKey: string,
  privateKey: string,
  callback: (data: BasicTxResponse) => void
) {
  const web3Api = state.getEvmApiMap[networkKey];
  const signer = new ethers.Wallet(privateKey);

  const signedTransaction = await signer.signTransaction(transactionObject);
  const response: BasicTxResponse = {
    errors: [],
  };

  try {
    signedTransaction && web3Api.provider.broadcastTransaction(signedTransaction);

    web3Api.provider.on('transactionHash', (hash: string) => {
      response.extrinsicHash = hash;
      callback(response);
    });
    web3Api.provider.on('receipt', (receipt: ethers.TransactionReceipt) => {
      handleTransferBalanceResult({
        receipt: receipt,
        response: response,
        callback: callback,
        networkKey: networkKey,
        changeValue: changeValue,
      });
    });
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
  const { gasPrice, maxFeePerGas, maxPriorityFeePerGas } = await web3Api.provider.getFeeData();

  const nonce = await web3Api.provider.getTransactionCount(to);
  const transactionObject = {
    maxFeePerGas,
    maxPriorityFeePerGas,
    nonce,
    to,
    value: ethers.parseEther(value),
  } as ethers.TransactionRequest;
  const gas = await web3Api.provider.estimateGas(transactionObject);
  const prepGasPrice = BigInt(gasPrice ?? 0);
  const gasLimit = gas;
  transactionObject.gasLimit = gasLimit;
  const estimateFee = prepGasPrice * gasLimit;

  transactionObject.value = ethers.parseEther(value);

  return { tx: transactionObject, value: transactionObject.value.toString(), fee: estimateFee };
}

export async function makeEVMTransfer(
  networkKey: string,
  to: string,
  privateKey: string,
  value: string,
  callback: (data: BasicTxResponse) => void
): Promise<void> {
  const { tx, value: _value } = await getEVMTransactionObject(networkKey, to, value);

  await handleTransfer(tx, _value, networkKey, privateKey, callback);
}

export async function getERC20TransactionObject(
  assetAddress: string,
  networkKey: string,
  from: string,
  to: string,
  value: string
): Promise<[ethers.TransactionRequest, string, bigint]> {
  const web3Api = state.getEvmApiMap[networkKey];
  const erc20Contract = getERC20Contract(networkKey, assetAddress);

  function generateTransferData(to: string, transferValue: ethers.BigNumberish) {
    return erc20Contract.transfer(to, transferValue);
  }

  const prepValue = ethers.parseUnits(value, 6).toString();
  const transferData = await generateTransferData(to, prepValue);
  const { gasPrice } = await web3Api.provider.getFeeData();

  const transactionObject = {
    gasPrice,
    from,
    to: assetAddress,
    data: transferData.data,
  } as ethers.TransactionRequest;

  const estimatedGas = await web3Api.provider.estimateGas(transactionObject);
  const gasLimit = estimatedGas;

  transactionObject.gasLimit = gasLimit;

  const estimateFee = gasPrice ? gasPrice * gasLimit : BigInt(0);

  return [transactionObject, value, estimateFee];
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
  const [transactionObject, changeValue] = await getERC20TransactionObject(assetAddress, networkKey, from, to, value);

  await handleTransfer(transactionObject, changeValue, networkKey, privateKey, callback);
}
