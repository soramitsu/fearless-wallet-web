import { ethers } from 'ethers';
import { APIItemState } from '@extension-base/api/types/networks';
import { state } from '@extension-base/background/handlers';
import { BalanceItem } from '@extension-base/api/evm/types/ether';
import { getERC20Contract } from '@extension-base/api/evm/utils/eth';
import { getSubstrateAddress } from '@extension-base/background/utils/utils';
import { setBalance } from '@extension-base/api/helpers';

async function getUtilityBalance(networkKey: string, address: string): Promise<string> {
  const eth = state.getEvmApiMap[networkKey];

  const balance = await eth.getBalance(address);

  return ethers.formatEther(balance);
}

async function fetchTokenBalance(address: string, networkKey: string, contractAddress: string) {
  const network = state.networkMap[networkKey];
  const asset = network.assets.find((el) => el.id === contractAddress);

  if (!asset) return;

  const contract = getERC20Contract(networkKey, contractAddress);
  const { symbol, precision, icon, name, id } = asset;
  let free = '0';

  try {
    const balance = await contract.balanceOf(address);

    free = ethers.formatUnits(balance, precision);

    setBalance(
      networkKey,
      {
        state: APIItemState.READY,
        key: networkKey,
        symbol,
        id,
        reserved: '0',
        frozen: '0',
        free,
        transferable: free,
        relayChain: 'ethereum',
        total: free,
        icon,
        name,
        chain: networkKey,
      },
      address
    );
  } catch (err) {
    setBalance(
      networkKey,
      {
        state: APIItemState.ERROR,
        key: networkKey,
        symbol,
        relayChain: 'ethereum',
        id,
        free,
        icon,
        name,
        chain: networkKey,
      },
      address
    );
    console.info(`There is problem when fetching ${symbol} token balance on ${networkKey}`, err);
  }
}

function fetchUtilityBalance(networkKey: string, ethereumAddress: string) {
  const network = state.networkMap[networkKey];
  const { icon, name, type, id, symbol } = network.assets.find((el) => el.isUtility)!;

  const balanceItem = {
    state: APIItemState.PENDING,
    symbol,
    name,
    icon,
    type,
    id,
    free: '0',
    relayChain: 'ethereum',
    reserved: '0',
    miscFrozen: '0',
    frozen: '0',
    transferable: '0',
    total: '0',
  } as BalanceItem;

  const address = getSubstrateAddress(ethereumAddress);

  getUtilityBalance(networkKey, ethereumAddress)
    .then((balance) => {
      balanceItem.free = balance;
      balanceItem.total = balance;
      balanceItem.transferable = balance;
      balanceItem.state = APIItemState.READY;

      setBalance(networkKey, balanceItem, address);
    })
    .catch(() => {
      balanceItem.state = APIItemState.ERROR;
      setBalance(networkKey, balanceItem, address);
    });
}

export function fetchEvmAssetBalance(ethereumAddress: string, networkKey: string, assetId: string) {
  const network = state.networkMap[networkKey];
  const asset = network.assets.find((asset) => asset.id === assetId);

  if (!asset) throw new Error(`Asset ${assetId} is missing on ${networkKey}`);

  if (asset.isUtility) fetchUtilityBalance(networkKey, ethereumAddress);
  else fetchTokenBalance(ethereumAddress, networkKey, asset.id);
}

export function fetchEvmTokenBalances(address: string, networkKey: string) {
  const network = state.networkMap[networkKey];

  const assets = network.assets;

  for (const asset of assets) {
    fetchTokenBalance(address, networkKey, asset.id);
  }
}
