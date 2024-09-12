import { ethers } from 'ethers';
import { APIItemState } from '@extension-base/api/types/networks';
import { getContract } from '@extension-base/api/evm/contracts';
import { setBalance } from '@extension-base/api/helpers';
import type { BalanceItem } from '@extension-base/api/evm/types';
import type State from '@extension-base/background/handlers/State';

async function getUtilityBalance(networkKey: string, address: string, state: State): Promise<string> {
  const apiProps = state.getEvmApi(networkKey);
  const eth = apiProps?.api;

  if (!eth) throw new Error('API not found');

  const balance = await eth.getBalance(address);

  return ethers.formatEther(balance);
}

async function fetchTokenBalance(ethereumAddress: string, networkKey: string, contractAddress: string, state: State) {
  const network = state.networkService.networkMap[networkKey];
  const asset = network.assets.find((el) => el.id === contractAddress);

  if (!asset) return;

  const api = state.getEvmApi(networkKey);

  if (!api.api) return;

  const contract = await getContract(contractAddress, api.api);
  const { symbol, precision, id } = asset;

  const balanceItem: Partial<BalanceItem> = {
    state: APIItemState.PENDING,
    symbol,
    id,
    relayChain: 'ethereum',
    free: '0',
    reserved: '0',
    frozen: '0',
    transferable: '0',
    total: '0',
  };

  contract
    .balanceOf(ethereumAddress)
    .then((balance) => {
      const free = ethers.formatUnits(balance, precision);

      balanceItem.free = free;
      balanceItem.transferable = free;
      balanceItem.total = free;
      balanceItem.state = APIItemState.READY;

      setBalance(networkKey, balanceItem, ethereumAddress, state);
    })
    .catch((ex) => {
      console.info(ex);

      balanceItem.state = APIItemState.ERROR;

      const retries = api.apiRetry ?? 0;

      api.apiRetry = retries + 1;

      balanceItem.state = APIItemState.ERROR;

      state.disableNetworkMap(networkKey);
      state.subscriptionService.getSubscription(networkKey)?.();

      setBalance(networkKey, balanceItem, ethereumAddress, state);

      console.info(`There is problem when fetching ${symbol} token balance on ${networkKey}`, ex);
    });
}

function fetchUtilityBalance(networkKey: string, ethereumAddress: string, state: State) {
  const network = state.networkService.networkMap[networkKey];
  const { id, symbol } = network.assets.find((el) => el.isUtility)!;

  const balanceItem: Partial<BalanceItem> = {
    state: APIItemState.PENDING,
    symbol,
    id,
    relayChain: 'ethereum',
    free: '0',
    reserved: '0',
    frozen: '0',
    transferable: '0',
    total: '0',
  };

  const address = state.keyringService.getSubstrateAddress(ethereumAddress);

  getUtilityBalance(networkKey, ethereumAddress, state)
    .then((balance) => {
      balanceItem.free = balance;
      balanceItem.total = balance;
      balanceItem.transferable = balance;
      balanceItem.state = APIItemState.READY;

      setBalance(networkKey, balanceItem, address, state);
    })
    .catch((ex) => {
      console.info(ex);

      balanceItem.state = APIItemState.ERROR;

      const api = state.getEvmApi(networkKey);
      const retries = api.apiRetry ?? 0;

      api.apiRetry = retries + 1;

      state.disableNetworkMap(networkKey);
      state.subscriptionService.getSubscription(networkKey)?.();

      setBalance(networkKey, balanceItem, address, state);
    });
}

export function fetchEvmAssetBalance(ethereumAddress: string, networkKey: string, assetId: string, state: State) {
  const network = state.networkService.networkMap[networkKey];
  const asset = network.assets.find((asset) => asset.id === assetId);

  if (!asset) throw new Error(`Asset ${assetId} is missing on ${networkKey}`);

  if (asset.isUtility) fetchUtilityBalance(networkKey, ethereumAddress, state);
  else fetchTokenBalance(ethereumAddress, networkKey, asset.id, state);
}
