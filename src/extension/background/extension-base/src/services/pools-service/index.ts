import { api as apiSora } from '@sora-substrate/util';
import { BasicTxErrorCode, type BasicTxResponse, TransferErrorCode } from '@extension-base/background/types/types';
import { getSoraAsset } from '@extension-base/api/substrate/sora';
import type {
  RequestAddLiquidity,
  PoolsParamsResponse,
  MakePoolsRequest,
  RequestRemoveLiquidity,
  MyPoolsInfo,
  PoolsParamsRequest,
  DefaultPoolsParams,
} from './types';
import type State from '@extension-base/background/handlers/State';
import type { NetworkName } from '@/interfaces';

export class PoolsService {
  constructor(private state: State) {}

  public async getPoolsParams(params: PoolsParamsRequest): Promise<PoolsParamsResponse> {
    const { networks } = params;

    // TODO use networks
    const promises: Promise<DefaultPoolsParams[]>[] = networks.map(async (network) => {
      const apiProps = this.state.getSubstrateApiMap[network.toLowerCase()];
      const isReady = await apiProps?.api?.isReady;

      if (!isReady) return [];

      return [
        {
          network,
          apr: 99,
          tvl: '101010',
          isMyPool: false,
          rewardAsset: 'PSWAP',
          asset1: {
            amount: '11',
            myAmount: '0',
            icon: 'https://raw.githubusercontent.com/soramitsu/shared-features-utils/master/icons/tokens/coloured/XOR.svg',
            id: 'b774c386-5cce-454a-a845-1ec0381538ec',
            name: 'xor',
          },
          asset2: {
            amount: '22',
            myAmount: '0',
            icon: 'https://raw.githubusercontent.com/soramitsu/shared-features-utils/master/icons/tokens/coloured/DAI.svg',
            id: '1e6f8ba3-5aeb-41d8-b80e-a44ce0f33716',
            name: 'dai',
          },
        },
        {
          network,
          apr: 12,
          tvl: '18560',
          isMyPool: true,
          rewardAsset: 'PSWAP',
          yourShare: '0.05',
          asset1: {
            amount: '33',
            myAmount: '1',
            icon: 'https://raw.githubusercontent.com/soramitsu/shared-features-utils/master/icons/tokens/coloured/XOR.svg',
            id: 'b774c386-5cce-454a-a845-1ec0381538ec',
            name: 'xor',
          },
          asset2: {
            amount: '44',
            myAmount: '5',
            icon: 'https://raw.githubusercontent.com/soramitsu/shared-features-utils/master/icons/tokens/coloured/DAI.svg',
            id: '1e6f8ba3-5aeb-41d8-b80e-a44ce0f33716',
            name: 'dai',
          },
        },
      ] as DefaultPoolsParams[];
    });

    const array = await Promise.all(promises);

    return array.flat();
  }

  public async getMyPoolsInfo(network: NetworkName): Promise<MyPoolsInfo> {
    const address = this.state.getCurrentAddress(network);

    // const poolsInfo = apiSora.poolXyk.remove(address);

    return { test: '' };
  }

  public async makePool({ params, type }: MakePoolsRequest): Promise<BasicTxResponse> {
    const { networkName, isSavePass } = params;
    const apiProps = this.state.getSubstrateApiMap[networkName.toLowerCase()];
    const isReady = await apiProps.api?.isReady;

    if (!isReady) return { status: false };

    apiSora.shouldPairBeLocked = !isSavePass;

    if (type === 'addLiquidity') return this.addLiquidity(params as RequestAddLiquidity);

    if (type === 'removeLiquidity') return this.removeLiquidity(params as RequestRemoveLiquidity);

    return {
      status: false,
      errors: [{ message: '[POOLS] unknown operation', code: BasicTxErrorCode.INVALID_PARAM }],
    };
  }

  public async addLiquidity(params: RequestAddLiquidity): Promise<BasicTxResponse> {
    const { assetId1, assetId2, amount1, amount2, slippage, networkName } = params;

    const address = this.state.getCurrentAddress(networkName);

    const tokenBalance1 = this.state.balanceService.getTokenBalance(address, assetId1);
    const tokenBalance2 = this.state.balanceService.getTokenBalance(address, assetId2);

    const _asset1 = getSoraAsset({ assetId: assetId1, tokenBalance: tokenBalance1, network: networkName }, this.state);
    const _asset2 = getSoraAsset({ assetId: assetId2, tokenBalance: tokenBalance2, network: networkName }, this.state);

    try {
      await apiSora.poolXyk.add(_asset1, _asset2, amount1, amount2, slippage);
    } catch (ex) {
      const message = `[POOLS] Add Liquidity failed: ${ex}`;

      console.info(message);

      return {
        status: false,
        errors: [
          {
            code: TransferErrorCode.ADD_LIQUIDITY_ERROR,
            message,
          },
        ],
      };
    }

    return { status: true };
  }

  public async removeLiquidity(params: RequestRemoveLiquidity): Promise<BasicTxResponse> {
    const { assetId1, assetId2, amount1, amount2, desiredMarker, supply, slippage, networkName } = params;
    const address = this.state.getCurrentAddress(networkName);

    const tokenBalance1 = this.state.balanceService.getTokenBalance(address, assetId1);
    const tokenBalance2 = this.state.balanceService.getTokenBalance(address, assetId2);

    const _asset1 = getSoraAsset({ assetId: assetId1, tokenBalance: tokenBalance1, network: networkName }, this.state);
    const _asset2 = getSoraAsset({ assetId: assetId2, tokenBalance: tokenBalance2, network: networkName }, this.state);

    try {
      await apiSora.poolXyk.remove(_asset1, _asset2, desiredMarker, amount1, amount2, supply, slippage);
    } catch (ex) {
      const message = `[POOLS] Remove Liquidity failed: ${ex}`;

      console.info(message);

      return {
        status: false,
        errors: [
          {
            code: TransferErrorCode.REMOVE_LIQUIDITY_ERROR,
            message,
          },
        ],
      };
    }

    return { status: true };
  }
}
