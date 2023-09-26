import { type TransactionRequest, Wallet, parseEther, parseUnits } from 'ethers';
import { BasicTxResponse, TransferErrorCode } from '@extension-base/background/types/types';
import { getERC20Contract } from '@extension-base/api/evm/utils/eth';
import { state } from '@extension-base/background/handlers';
import { getAssetInfo } from '../substrate/registry';

export type HandleBasicTx = (data: BasicTxResponse) => void;
export type HandleTxResponse<T extends BasicTxResponse> = (data: T) => void;

export async function handleTransfer(
  transactionObject: TransactionRequest,
  networkKey: string,
  privateKey: string,
  callback: (data: BasicTxResponse) => void
) {
  const web3Api = state.getEvmApiMap[networkKey];
  const signer = new Wallet(privateKey, web3Api);

  const response: BasicTxResponse = {
    errors: [],
  };

  try {
    await signer.sendTransaction(transactionObject);

    response.status = true;
    callback(response);
  } catch (error) {
    console.warn(error);
    response.status = false;
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
): Promise<{ tx: TransactionRequest; value: string; fee: bigint }> {
  const web3Api = state.getEvmApiMap[networkKey];
  const { maxFeePerGas, maxPriorityFeePerGas, gasPrice } = await web3Api.getFeeData();

  const transactionObject = {
    maxFeePerGas,
    maxPriorityFeePerGas,
    to,
    value: parseEther(value),
  } as TransactionRequest;

  const gasLimit = await web3Api.provider.estimateGas(transactionObject);
  const block = await web3Api.provider.getBlock('latest');
  const baseFeePerGas = block?.baseFeePerGas ?? BigInt(0);
  transactionObject.gasLimit = gasLimit;

  const prepGasPrice = (maxPriorityFeePerGas ? maxPriorityFeePerGas : gasPrice ?? BigInt(0)) + baseFeePerGas;
  const estimateFee = prepGasPrice * gasLimit;

  transactionObject.value = parseEther(value);

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
  assetId: string,
  networkKey: string,
  from: string,
  to: string,
  value: string
): Promise<{ tx: TransactionRequest; value: string; fee: bigint }> {
  const web3Api = state.getEvmApiMap[networkKey];
  const erc20Contract = getERC20Contract(networkKey, assetId);

  function generateTransferData(to: string, transferValue: string): string {
    const tokenInfo = getAssetInfo(assetId);
    const parsedValue = parseUnits(transferValue, tokenInfo.precision);

    return erc20Contract.interface.encodeFunctionData('transfer', [to, parsedValue]);
  }

  const data = generateTransferData(to, value);

  const transactionObject: TransactionRequest = {
    to: erc20Contract.target,
    from,
    data,
    value: parseEther('0.0'),
  };

  const gasLimit = await web3Api.estimateGas(transactionObject);
  const block = await web3Api.provider.getBlock('latest');
  const baseFeePerGas = block?.baseFeePerGas ?? BigInt(0);
  transactionObject.gasLimit = gasLimit;
  const { maxPriorityFeePerGas, gasPrice } = await web3Api.getFeeData();

  const prepGasPrice = maxPriorityFeePerGas ? maxPriorityFeePerGas : gasPrice ?? BigInt(0) + baseFeePerGas;
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

  await handleTransfer(tx, networkKey, privateKey, callback);
}
