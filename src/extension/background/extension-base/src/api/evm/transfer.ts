import { type TransactionRequest, Wallet, parseEther, parseUnits } from 'ethers';
import { BasicTxResponse, TransferErrorCode } from '@extension-base/background/types/types';
import { getERC20Contract } from '@extension-base/api/evm/utils/eth';
import { getAssetInfo } from '@extension-base/api/helpers';
import { fetchEvmAssetBalance } from './balance';
import type State from '@extension-base/background/handlers/State';

export type HandleBasicTx = (data: BasicTxResponse) => void;
export type HandleTxResponse<T extends BasicTxResponse> = (data: T) => void;
export type HandleTransferProps = {
  tx: TransactionRequest;
  networkKey: string;
  privateKey: string;
  assetId: string;
  callback: (data: BasicTxResponse) => void;
};

export async function handleTransfer(
  { assetId, callback, networkKey, privateKey, tx }: HandleTransferProps,
  state: State
) {
  const web3Api = state.getEvmApiMap[networkKey];
  const signer = new Wallet(privateKey, web3Api);

  try {
    await signer.sendTransaction(tx);

    callback({ status: true });
  } catch (error: any) {
    console.warn(error);

    callback({
      status: false,
      errors: [
        {
          code: TransferErrorCode.TRANSFER_ERROR,
          message: error.message,
        },
      ],
    });
  }

  setTimeout(() => {
    const address = tx.from as string;

    fetchEvmAssetBalance(address, networkKey, assetId, state);
  }, 15000);
}

export async function getEVMTransactionObject(
  networkKey: string,
  to: string,
  value: string,
  state: State
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
  assetId: string,
  networkKey: string,
  to: string,
  privateKey: string,
  value: string,
  callback: (data: BasicTxResponse) => void,
  state: State
): Promise<void> {
  const { tx } = await getEVMTransactionObject(networkKey, to, value, state);
  const props: HandleTransferProps = {
    assetId,
    callback,
    networkKey,
    privateKey,
    tx,
  };

  await handleTransfer(props, state);
}

export async function getERC20TransactionObject(
  assetId: string,
  networkKey: string,
  from: string,
  to: string,
  value: string,
  state: State
): Promise<{ tx: TransactionRequest; value: string; fee: bigint }> {
  const web3Api = state.getEvmApiMap[networkKey];
  const erc20Contract = getERC20Contract(networkKey, assetId, state);

  function generateTransferData(to: string, transferValue: string): string {
    const tokenInfo = getAssetInfo(assetId, state);
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
  assetId: string,
  networkKey: string,
  from: string,
  to: string,
  privateKey: string,
  value: string,
  callback: (data: BasicTxResponse) => void,
  state: State
) {
  const { tx } = await getERC20TransactionObject(assetId, networkKey, from, to, value, state);
  const props: HandleTransferProps = {
    assetId,
    callback,
    networkKey,
    privateKey,
    tx,
  };

  await handleTransfer(props, state);
}
