import { Contract, ethers } from 'ethers';
import { FPNumber } from '@sora-substrate/util';
import { ASTAR_REFRESH_BALANCE_INTERVAL, SUB_TOKEN_REFRESH_BALANCE_INTERVAL } from '../../const/intervals';
import { APIItemState } from '../types/networks';
import { state } from '../../background/handlers';
import { BalanceItem } from './types/ether';
import { getERC20Contract } from './utils/eth';

export async function getEtherBalance(networkKey: string, address: string): Promise<string> {
  const eth = state.getEvmApiMap[networkKey];
  const balance = await eth.getBalance(address);

  return ethers.utils.formatEther(balance);
}

function subscribeERC20Interval(
  address: string,
  networkKey: string,
  subCallback: (rs: Partial<BalanceItem>) => void
): () => void {
  const ERC20ContractMap = {} as Record<string, Contract>;

  const getTokenBalances = () => {
    state.networkMap[networkKey].assets.map(async ({ symbol, name, icon, precision }) => {
      let free = '0';

      try {
        const contract = ERC20ContractMap[symbol];
        const bal = await contract.balanceOf(address);

        free = new FPNumber(bal, precision).value.toString();

        subCallback({
          state: APIItemState.READY,
          key: networkKey,
          symbol,
          reserved: '0',
          frozen: '0',
          free,
          transferable: free,
          total: free,
          icon,
          name,
          chain: networkKey,
        });
      } catch (err) {
        console.info('There is problem when fetching ' + symbol + ' token balance', err);
      }
    });
  };

  state.networkMap[networkKey].assets.forEach(({ smartContract, symbol }) => {
    if (smartContract) {
      ERC20ContractMap[symbol] = getERC20Contract(networkKey, smartContract);
    }
  });

  getTokenBalances();

  const interval = setInterval(getTokenBalances, SUB_TOKEN_REFRESH_BALANCE_INTERVAL);

  return () => {
    clearInterval(interval);
  };
}

export function subscribeEVMBalance(
  networkKey: string,
  address: string,
  callback: (networkKey: string, rs: Partial<BalanceItem>) => void
) {
  const network = state.networkMap[networkKey];
  const { icon, name, type } = network.assets.find((el) => el.isUtility)!;
  const balanceItem = {
    state: APIItemState.PENDING,
    name,
    icon,
    type,
    free: '0',
    reserved: '0',
    miscFrozen: '0',
    frozen: '0',
    transferable: '0',
    total: '0',
  } as BalanceItem;

  function getBalance() {
    getEtherBalance(networkKey, address)
      .then((balance) => {
        balanceItem.free = balance;
        balanceItem.total = balance;
        balanceItem.transferable = balance;
        balanceItem.state = APIItemState.READY;

        callback(networkKey, balanceItem);
      })
      .catch(console.warn);
  }

  function subCallback(item: Partial<BalanceItem>) {
    callback(networkKey, item);
  }

  getBalance();

  const interval = setInterval(getBalance, ASTAR_REFRESH_BALANCE_INTERVAL);
  const unsub = subscribeERC20Interval(address, networkKey, subCallback);

  return () => {
    clearInterval(interval);
    unsub && unsub();
  };
}
