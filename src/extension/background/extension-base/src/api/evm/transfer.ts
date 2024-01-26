import { type TransactionRequest, Wallet, parseEther, parseUnits } from 'ethers';
import { type BasicTxResponse, TransferErrorCode } from '@extension-base/background/types/types';
import { getERC20Contract } from '@extension-base/api/evm/utils/eth';
import { state } from '@extension-base/background/handlers';
import { type BalanceItem } from '@extension-base/api/evm/types/ether';

export type HandleBasicTx = (data: BasicTxResponse) => void;
export type HandleTxResponse<T extends BasicTxResponse> = (data: T) => void;
export type HandleTransferProps = {
  tx: TransactionRequest;
  networkKey: string;
  privateKey: string;
  callback: (data: BasicTxResponse) => void;
};

interface TransferParams {
  balance: BalanceItem;
  networkKey: string;
  from: string;
  to: string;
  amount: string;
}

interface TransactionObject {
  tx: TransactionRequest;
  fee: bigint;
}

interface MakeTransferParams extends TransferParams {
  privateKey: string;
  callback: (data: BasicTxResponse) => void;
}

export async function handleTransfer({ callback, networkKey, privateKey, tx }: HandleTransferProps): Promise<void> {
  const web3Api = state.getEvmApi(networkKey);
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

  setTimeout(() => state.fetchEvmBalance([networkKey]), 15000);
}

async function getUtilityTransactionObject(params: TransferParams): Promise<TransactionObject> {
  const { networkKey, to, amount } = params;
  const web3Api = state.getEvmApi(networkKey);

  if (!web3Api) throw new Error(`Unknown network ${networkKey}`);

  const { maxFeePerGas, maxPriorityFeePerGas } = await web3Api.getFeeData();

  const transactionObject = {
    to,
    maxFeePerGas,
    maxPriorityFeePerGas,
    value: parseEther(amount),
  } as TransactionRequest;

  const gasLimit = await web3Api.provider.estimateGas(transactionObject);
  const block = await web3Api.provider.getBlock('latest');

  const baseFeePerGas = block?.baseFeePerGas;
  const prepGasPrice = gasPrice ?? maxPriorityFeePerGas ?? baseFeePerGas ?? BigInt(0);
  const estimateFee = prepGasPrice * gasLimit;

  transactionObject.gasLimit = gasLimit;
  transactionObject.value = parseEther(amount);

  return { tx: transactionObject, fee: estimateFee };
}

async function getERC20TransactionObject(params: TransferParams): Promise<TransactionObject> {
  const { balance, networkKey, to, from, amount } = params;
  const contractAddress = balance.id;
  const web3Api = state.getEvmApi(networkKey);

  const erc20Contract = await getERC20Contract(contractAddress, web3Api);

  const parsedValue = parseUnits(amount, balance.precision);
  const data = erc20Contract.interface.encodeFunctionData('transfer', [to, parsedValue]);
  const { maxFeePerGas, maxPriorityFeePerGas } = await web3Api.getFeeData();
  const block = await web3Api.provider.getBlock('latest');

  const baseFeePerGas = block?.baseFeePerGas ?? BigInt(0);

  const prepGasPrice = baseFeePerGas ?? maxPriorityFeePerGas;
  const transactionObject: TransactionRequest = {
    to: contractAddress,
    from,
    data,
    maxFeePerGas,
    maxPriorityFeePerGas,
    value: parseEther('0.0'),
  };

  const gasLimit = await web3Api.estimateGas(transactionObject);

  const estimateFee = prepGasPrice * gasLimit;

  transactionObject.gasLimit = gasLimit;

  return { tx: transactionObject, fee: estimateFee };
}

async function makeUtilityTransfer(params: MakeTransferParams): Promise<void> {
  const { callback, networkKey, privateKey } = params;
  const { tx } = await getUtilityTransactionObject(params);

  const props: HandleTransferProps = {
    callback,
    networkKey,
    privateKey,
    tx,
  };

  await handleTransfer(props);
}

async function makeERC20Transfer(params: MakeTransferParams) {
  const { callback, networkKey, privateKey } = params;
  const { tx } = await getERC20TransactionObject(params);

  const props: HandleTransferProps = {
    callback,
    networkKey,
    privateKey,
    tx,
  };

  await handleTransfer(props);
}

export async function getEVMTransactionObject(params: TransferParams): Promise<TransactionObject> {
  if (params.balance.isUtility) return await getUtilityTransactionObject(params);

  return await getERC20TransactionObject(params);
}

export function makeEVMTransfer(params: MakeTransferParams): Promise<void> {
  if (params.balance.isUtility) return makeUtilityTransfer(params);

  return makeERC20Transfer(params);
}
