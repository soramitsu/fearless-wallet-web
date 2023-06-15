import { ethers } from 'ethers';
import {
  BasicTxResponse,
  ExternalRequestPromise,
  ExternalRequestPromiseStatus,
  TransferErrorCode,
} from '@extension-base/background/types/types';
import EthProvider from '@extension-base/api/evm/ethProvider';
import { getERC20Contract } from '@extension-base/api/evm/utils/eth';

export type HandleBasicTx = (data: BasicTxResponse) => void;
export type HandleTxResponse<T extends BasicTxResponse> = (data: T) => void;

interface HandleTransferBalanceResultProps {
  callback: HandleBasicTx;
  changeValue: string;
  networkKey: string;
  receipt: ethers.providers.TransactionReceipt;
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

  const fee = (receipt.gasUsed.toNumber() * receipt.effectiveGasPrice.toNumber()).toString();

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
  transactionObject: ethers.providers.TransactionRequest,
  changeValue: string,
  networkKey: string,
  privateKey: string,
  web3ApiMap: Record<string, EthProvider>,
  callback: (data: BasicTxResponse) => void
) {
  const web3Api = web3ApiMap[networkKey];
  const signer = new ethers.Wallet(privateKey);

  const signedTransaction = await signer.signTransaction(transactionObject);
  const response: BasicTxResponse = {
    errors: [],
  };

  try {
    signedTransaction && web3Api.provider.sendTransaction(signedTransaction);

    web3Api.provider
      .on('transactionHash', (hash: string) => {
        response.extrinsicHash = hash;
        callback(response);
      })
      .on('receipt', (receipt: ethers.providers.TransactionReceipt) => {
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
  value: string,
  web3ApiMap: Record<string, EthProvider>
): Promise<[ethers.providers.TransactionRequest, string, number]> {
  const web3Api = web3ApiMap[networkKey];
  const feeData = await web3Api.provider.getFeeData();
  const gasPrice = feeData.gasPrice;
  const nonce = await web3Api.provider.getTransactionCount('0x599dC6fD485E0eD55C1BCc7D8AE02EDAF7bE4f4e'); // TODO mock ???
  const transactionObject = {
    gasPrice: gasPrice,
    nonce,
    to: to,
  } as ethers.providers.TransactionRequest;

  const gasLimit = (await web3Api.provider.estimateGas(transactionObject)).toNumber();
  transactionObject.gasLimit = gasLimit;
  const estimateFee = gasPrice!.toNumber() * gasLimit;

  transactionObject.value = ethers.utils.parseEther(value);

  return [transactionObject, transactionObject.value.toString(), estimateFee];
}

export async function makeEVMTransfer(
  networkKey: string,
  to: string,
  privateKey: string,
  value: string,
  web3ApiMap: Record<string, EthProvider>,
  callback: (data: BasicTxResponse) => void
): Promise<void> {
  const [transactionObject, changeValue] = await getEVMTransactionObject(networkKey, to, value, web3ApiMap);

  await handleTransfer(transactionObject, changeValue, networkKey, privateKey, web3ApiMap, callback);
}

export async function getERC20TransactionObject(
  assetAddress: string,
  networkKey: string,
  from: string,
  to: string,
  value: string,
  web3ApiMap: Record<string, EthProvider>
): Promise<[ethers.providers.TransactionRequest, string, number]> {
  const web3Api = web3ApiMap[networkKey];
  const erc20Contract = getERC20Contract(networkKey, assetAddress, web3ApiMap);

  const transferValue = value;

  function generateTransferData(to: string, transferValue: string): string {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
    return erc20Contract.methods.transfer(to, transferValue).encodeABI() as string;
  }

  const transferData = generateTransferData(to, transferValue);
  const gasPrice = await web3Api.getGasPrice();
  const transactionObject = {
    gasPrice: gasPrice,
    from,
    to: assetAddress,
    data: transferData,
  } as ethers.providers.TransactionRequest;

  const gasLimit = await web3Api.provider.estimateGas(transactionObject);

  transactionObject.gasLimit = gasLimit.toNumber();

  const estimateFee = gasPrice.toNumber() * gasLimit.toNumber();

  return [transactionObject, transferValue, estimateFee];
}

export async function makeERC20Transfer(
  assetAddress: string,
  networkKey: string,
  from: string,
  to: string,
  privateKey: string,
  value: string,
  web3ApiMap: Record<string, EthProvider>,
  callback: (data: BasicTxResponse) => void
) {
  const [transactionObject, changeValue] = await getERC20TransactionObject(
    assetAddress,
    networkKey,
    from,
    to,
    value,
    web3ApiMap
  );

  await handleTransfer(transactionObject, changeValue, networkKey, privateKey, web3ApiMap, callback);
}
