import { ApiPromise } from '@polkadot/api';
import { BN, bnToHex } from '@polkadot/util';
import { PREDEFINE_TOKEN_DATA_MAP } from '../predefineChainTokens';
import { CustomToken, TokenInfo } from '../types/ether';
export interface ChainRegistry {
  chainDecimals: number[];
  chainTokens: string[];
  tokenMap: Record<string, TokenInfo>;
}

export const moonbeamBaseChains = ['moonbase', 'moonbeam', 'moonriver'];

const DEFAULT_TOKEN_REGISTRY: Record<string, { chainDecimals: number[]; chainTokens: string[] }> = {
  ethereum: { chainDecimals: [18], chainTokens: ['ETH'] },
  ethereum_goerli: { chainDecimals: [18], chainTokens: ['GoerliETH'] },
  binance: { chainDecimals: [18], chainTokens: ['BNB'] },
  binance_test: { chainDecimals: [18], chainTokens: ['tBNB'] },
  boba_rinkeby: { chainDecimals: [18], chainTokens: ['ETH'] },
  boba: { chainDecimals: [18], chainTokens: ['ETH'] },
  bobabase: { chainDecimals: [18], chainTokens: ['BOBA'] },
  bobabeam: { chainDecimals: [18], chainTokens: ['BOBA'] },
  watr_network_evm: { chainDecimals: [18], chainTokens: ['WATRD'] },
};

export const cacheRegistryMap: Record<string, ChainRegistry> = {};

// temporary fix for token symbols, need a better fix later
function formatTokenSymbol(rawSymbol: string) {
  if (rawSymbol === 'xcKBTC') {
    return 'xckBTC';
  } else if (rawSymbol === 'xcIBTC') {
    return 'xciBTC';
  } else if (rawSymbol === 'KBTC') {
    return 'kBTC';
  } else if (rawSymbol === 'IBTC') {
    return 'iBTC';
  }

  return rawSymbol;
}

export const getRegistry = async (networkKey: string, api: ApiPromise, customTokens?: CustomToken[]) => {
  const cached = cacheRegistryMap[networkKey];

  if (cached) {
    return cached;
  }

  await api.isReady;

  const { chainDecimals, chainTokens } = api.registry ||
    DEFAULT_TOKEN_REGISTRY[networkKey] || { chainDecimals: [], chainTokens: [] };

  // Hotfix for these network because substrate and evm response different decimal
  if (['pangolinEvm', 'crabEvm'].includes(networkKey)) {
    chainDecimals.forEach((x, i, l) => {
      l[i] = 18;
    });
  }

  // Build token map
  const tokenMap = {} as Record<string, TokenInfo>;

  if (!['genshiro_testnet', 'genshiro', 'equilibrium_parachain', 'acala', 'karura'].includes(networkKey)) {
    chainTokens.forEach((token, index) => {
      const formattedToken = formatTokenSymbol(token);

      tokenMap[formattedToken] = {
        isMainToken: index === 0,
        name: formattedToken,
        symbol: formattedToken,
        decimals: chainDecimals[index],
      };
    });
  }

  const predefineTokenMap = PREDEFINE_TOKEN_DATA_MAP[networkKey];

  if (predefineTokenMap) {
    Object.assign(tokenMap, predefineTokenMap);
  }

  if (['karura', 'acala', 'bifrost'].indexOf(networkKey) > -1) {
    const foreignTokens = await getForeignToken(api);

    Object.assign(tokenMap, foreignTokens);

    if (networkKey === 'karura') {
      // quick fix for native token
      tokenMap.KAR.isMainToken = true;
    } else if (networkKey === 'acala') {
      tokenMap.ACA.isMainToken = true;
    } else if (networkKey === 'bifrost') {
      tokenMap.BNC.isMainToken = true;
      delete tokenMap.KUSD;
    }
  }

  // Get moonbeam base chains tokens
  if (moonbeamBaseChains.indexOf(networkKey) > -1) {
    const moonTokens = await getMoonAssets(api);

    Object.assign(tokenMap, moonTokens);
  }

  if (customTokens) {
    for (const customToken of customTokens) {
      if (customToken.chain === networkKey && customToken.symbol && !(customToken.symbol in tokenMap)) {
        tokenMap[customToken.symbol] = {
          contractAddress: customToken.smartContract,
          isMainToken: false,
          name: customToken.name,
          symbol: customToken.symbol,
          decimals: customToken.decimals as number,
          type: customToken.type, // must have type to retrieve balance
        } as TokenInfo;
      }
    }
  }

  const chainRegistry = {
    chainDecimals,
    chainTokens,
    tokenMap,
  } as ChainRegistry;

  cacheRegistryMap[networkKey] = chainRegistry;

  return chainRegistry;
};

export async function getTokenInfo(networkKey: string, api: ApiPromise, token: string): Promise<TokenInfo | undefined> {
  const { tokenMap } = await getRegistry(networkKey, api);

  return tokenMap[token];
}

export async function getForeignToken(api: ApiPromise) {
  await api.isReady;
  const allTokens = await api.query.assetRegistry.assetMetadatas.entries();

  const tokenMap = {} as Record<string, TokenInfo>;

  allTokens.forEach(([storageKey, tokenData]) => {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const assetMetadata = storageKey.toHuman()[0] as Record<string, any>;

    let specialOption;

    if (assetMetadata.ForeignAssetId) {
      specialOption = {
        ForeignAsset: assetMetadata.ForeignAssetId as string,
      };
    } else if (assetMetadata.NativeAssetId) {
      if (assetMetadata.NativeAssetId.Token) {
        specialOption = {
          Token: assetMetadata.NativeAssetId.Token as string,
        };
      } else if (assetMetadata.NativeAssetId.LiquidCrowdloan) {
        specialOption = {
          LiquidCrowdloan: assetMetadata.NativeAssetId.LiquidCrowdloan as string,
        };
      } else if (assetMetadata.NativeAssetId.VSToken) {
        specialOption = {
          VSToken: assetMetadata.NativeAssetId.VSToken as string,
        };
      } else if (assetMetadata.NativeAssetId.Native) {
        specialOption = {
          Native: assetMetadata.NativeAssetId.Native as string,
        };
      } else if (assetMetadata.NativeAssetId.Stable) {
        specialOption = {
          Stable: assetMetadata.NativeAssetId.Stable as string,
        };
      }
    } else if (assetMetadata.Erc20) {
      specialOption = {
        Erc20: assetMetadata.Erc20 as string,
      };
    } else if (assetMetadata.StableAssetId) {
      specialOption = {
        StableAssetPoolToken: assetMetadata.StableAssetId as string,
      };
    }

    const { decimals, name, symbol } = tokenData.toHuman() as {
      symbol: string;
      decimals: string;
      name: string;
    };

    if (!(symbol in tokenMap)) {
      if (symbol === 'KUSD') {
        tokenMap.aUSD = {
          isMainToken: false,
          symbol: 'aUSD',
          decimals: parseInt(decimals),
          name,
          specialOption,
        };
      } else {
        tokenMap[symbol] = {
          isMainToken: false,
          symbol,
          decimals: parseInt(decimals),
          name,
          specialOption,
        };
      }
    }
  });

  return tokenMap;
}

export async function getMoonAssets(api: ApiPromise) {
  await api.isReady;
  const assets = await api.query.assets.metadata.entries();
  const assetRecord = {} as Record<string, TokenInfo>;

  assets.forEach(([assetKey, value]) => {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const keyString = assetKey.toHuman()[0].toString().replace(/,/g, '');
    const hexAddress = bnToHex(new BN(keyString)).slice(2).toUpperCase();
    const address = '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF'.slice(0, -hexAddress.length) + hexAddress;

    const valueData = value.toHuman();
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const info = {
      isMainToken: false,
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      name: valueData.name,
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      symbol: formatTokenSymbol(valueData.symbol),
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      decimals: parseInt(valueData.decimals || ' 0'),
      contractAddress: address,
      assetId: keyString,
    } as TokenInfo;

    assetRecord[info.symbol] = info;
  });

  return assetRecord;
}
