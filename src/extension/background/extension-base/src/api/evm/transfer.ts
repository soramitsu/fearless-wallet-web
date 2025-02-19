import { type TransactionRequest, Wallet, parseEther, parseUnits } from 'ethers';
import { type BasicTxResponse, TransferErrorCode } from '@extension-base/background/types/types';
import { state } from '@extension-base/background/handlers';
import { type BalanceItem } from '@extension-base/api/evm/types';
import type State from '@extension-base/background/handlers/State';

export type HandleBasicTx = (data: BasicTxResponse) => void;

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
  callback?: (data: BasicTxResponse) => void;
}

export interface HandleTransferProps extends MakeTransferParams {
  tx: TransactionRequest;
}

export async function handleTransfer({ callback, networkKey, privateKey, tx }: HandleTransferProps): Promise<void> {
  const web3Api = state.getEvmApi(networkKey)?.api;
  const signer = new Wallet(privateKey, web3Api);

  try {
    await signer.sendTransaction(tx);

    callback?.({ status: true });
  } catch (error: any) {
    console.warn(error);

    callback?.({
      status: false,
      errors: [
        {
          code: TransferErrorCode.TRANSFER_ERROR,
          message: error.message,
        },
      ],
    });
  }
}

export function calcEvmFees(maxFee: bigint | null, baseFee: bigint | null | undefined, gasLimit: bigint): bigint {
  const baseFeePerGas = baseFee ?? BigInt(0);
  const maxFeePerGasPrep = maxFee ?? BigInt(0);
  const prepGasPrice = maxFeePerGasPrep + baseFeePerGas;

  return prepGasPrice * gasLimit;
}

async function getUtilityTransactionObject(params: TransferParams): Promise<TransactionObject> {
  const { networkKey, to, amount } = params;
  const web3Api = state.getEvmApi(networkKey)?.api;

  if (!web3Api) throw new Error(`Unknown network ${networkKey}`);

  const { maxFeePerGas, maxPriorityFeePerGas, gasPrice } = await web3Api.getFeeData();

  const transactionObject: TransactionRequest = {
    to,
    maxFeePerGas,
    maxPriorityFeePerGas,
    value: parseEther('0.0'),
  } as TransactionRequest;

  const gasLimit = await web3Api.provider.estimateGas(transactionObject);
  const block = await web3Api.provider.getBlock('latest');

  const estimateFee = calcEvmFees(maxFeePerGas ?? gasPrice, block?.baseFeePerGas, gasLimit);

  transactionObject.gasLimit = gasLimit;
  transactionObject.value = parseEther(amount);

  return { tx: transactionObject, fee: estimateFee };
}

async function getERC20TransactionObject(params: TransferParams, state: State): Promise<TransactionObject> {
  const { balance, networkKey, to, from, amount } = params;
  const contractAddress = balance.id;
  const web3Api = state.getEvmApi(networkKey)?.api;

  const erc20Contract = await state.evmContractService.getContract(contractAddress, web3Api);

  const parsedValue = parseUnits(amount, balance.precision);
  const data = erc20Contract.interface.encodeFunctionData('transfer', [to, parsedValue]);

  if (!web3Api) throw new Error(`${networkKey} API not found`);

  const { maxFeePerGas, gasPrice } = await web3Api.getFeeData();
  const block = await web3Api.provider.getBlock('latest');

  const transactionObject: TransactionRequest = {
    to: contractAddress,
    from,
    data,
  };

  let gasLimit = BigInt(0);

  try {
    gasLimit = await web3Api.estimateGas(transactionObject);
  } catch (e) {
    //BNB on ethereum is working that way, remove if something better is comes up
    console.info(e);

    const tx = { ...transactionObject };

    delete tx.data;

    gasLimit = await web3Api.estimateGas(tx);
  }

  const estimateFee = calcEvmFees(maxFeePerGas ?? gasPrice, block?.baseFeePerGas, gasLimit);

  transactionObject.gasLimit = gasLimit;
  transactionObject.maxFeePerGas = maxFeePerGas;

  return { tx: transactionObject, fee: estimateFee };
}

async function makeUtilityTransfer(params: MakeTransferParams): Promise<void> {
  const { tx } = await getUtilityTransactionObject(params);

  return handleTransfer({ ...params, tx });
}

async function makeERC20Transfer(params: MakeTransferParams, state: State) {
  const { tx } = await getERC20TransactionObject(params, state);

  return handleTransfer({ ...params, tx });
}

export function getEVMTransactionObject(params: TransferParams, state: State): Promise<TransactionObject> {
  if (params.balance.isUtility) return getUtilityTransactionObject(params);

  return getERC20TransactionObject(params, state);
}

export async function makeEVMTransfer(params: MakeTransferParams, state: State): Promise<void> {
  const transfer = params.balance.isUtility ? makeUtilityTransfer(params) : makeERC20Transfer(params, state);

  return transfer.finally(() => {
    setTimeout(() => {
      state.balanceService.evmBalanceService.fetchBalance({
        ethereumAddress: params.from,
        assetId: params.balance.id,
        force: true,
        networks: [params.networkKey],
      });
    }, 8000);
  });
}
