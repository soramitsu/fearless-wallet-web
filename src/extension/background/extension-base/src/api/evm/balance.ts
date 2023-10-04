import { ethers } from 'ethers';
import { APIItemState } from '@extension-base/api/types/networks';
import { BalanceItem } from '@extension-base/api/evm/types/ether';
import { getERC20Contract } from '@extension-base/api/evm/utils/eth';
import { getSubstrateAddress } from '@extension-base/background/utils/utils';
import { setBalance } from '@extension-base/api/helpers';
import State from '@extension-base/background/handlers/State';

async function getUtilityBalance(networkKey: string, address: string, state: State): Promise<string> {
  const eth = state.getEvmApiMap[networkKey];

  const balance = await eth.getBalance(address);

  return ethers.formatEther(balance);
}

async function fetchTokenBalance(address: string, networkKey: string, contractAddress: string, state: State) {
  const network = state.networkMap[networkKey];
  const asset = network.assets.find((el) => el.id === contractAddress);

  if (!asset) return;

  const contract = await getERC20Contract(networkKey, contractAddress, state);
  const { symbol, precision, icon, id } = asset;

  const balanceItem = {
    state: APIItemState.PENDING,
    symbol,
    id,
    icon,
    reserved: '0',
    frozen: '0',
    free: '0',
    transferable: '0',
    total: '0',
    relayChain: 'ethereum',
    key: networkKey,
    name: networkKey,
    chain: networkKey,
  } as BalanceItem;

  try {
    const balance = await contract.balanceOf(address);
    const free = ethers.formatUnits(balance, precision);

    balanceItem.free = free;
    balanceItem.transferable = free;
    balanceItem.total = free;
    balanceItem.state = APIItemState.READY;

    setBalance(networkKey, balanceItem, address, state);
  } catch (ex) {
    balanceItem.state = APIItemState.ERROR;

    setBalance(networkKey, balanceItem, address, state);

    console.info(`There is problem when fetching ${symbol} token balance on ${networkKey}`, ex);
  }
}

async function fetchUtilityBalance(networkKey: string, ethereumAddress: string, state: State) {
  const network = state.networkMap[networkKey];
  const { icon, type, id, symbol } = network.assets.find((el) => el.isUtility)!;

  const balanceItem = {
    state: APIItemState.PENDING,
    symbol,
    icon,
    type,
    id,
    name: networkKey,
    free: '0',
    relayChain: 'ethereum',
    reserved: '0',
    miscFrozen: '0',
    frozen: '0',
    transferable: '0',
    total: '0',
  } as BalanceItem;

  const address = getSubstrateAddress(ethereumAddress, state);

  try {
    const balance = await getUtilityBalance(networkKey, ethereumAddress, state);

    balanceItem.free = balance;
    balanceItem.total = balance;
    balanceItem.transferable = balance;
    balanceItem.state = APIItemState.READY;

    setBalance(networkKey, balanceItem, address, state);
  } catch {
    balanceItem.state = APIItemState.ERROR;

    setBalance(networkKey, balanceItem, address, state);
  }
}

export function fetchEvmAssetBalance(ethereumAddress: string, networkKey: string, assetId: string, state: State) {
  const network = state.networkMap[networkKey];
  const asset = network.assets.find((asset) => asset.id === assetId);

  if (!asset) throw new Error(`Asset ${assetId} is missing on ${networkKey}`);

  if (asset.isUtility) fetchUtilityBalance(networkKey, ethereumAddress, state);
  else fetchTokenBalance(ethereumAddress, networkKey, asset.id, state);
}
