export default {
  rpc: {
    listApps: {
      description: '',
      params: [
        {
          name: 'at',
          type: 'BlockHash',
          isOptional: true,
        },
      ],
      type: 'Vec<BridgeAppInfo>',
    },
    listAssets: {
      description: '',
      params: [
        {
          name: 'networkId',
          type: 'GenericNetworkId',
        },
        {
          name: 'at',
          type: 'BlockHash',
          isOptional: true,
        },
      ],
      type: 'Vec<BridgeAssetInfo>',
    },
  },
  types: {
    BridgeAppInfo: {
      _enum: {
        EVM: '(GenericNetworkId, EVMAppInfo)',
        Sub: '(GenericNetworkId)',
      },
    },
    BridgeAssetInfo: {
      _enum: {
        EVMLegacy: 'EVMLegacyAssetInfo',
        EVM: 'EVMAssetInfo',
        Sub: 'SubAssetInfo',
      },
    },
    EVMAppInfo: {
      evmAddress: 'H160',
      appKind: 'EVMAppKind',
    },
    EVMAssetInfo: {
      assetId: 'MainnetAssetId',
      evmAddress: 'H160',
      appKind: 'EVMAppKind',
      precision: 'u8',
    },
    EVMLegacyAssetInfo: {
      assetId: 'MainnetAssetId',
      evmAddress: 'H160',
      appKind: 'EVMAppKind',
      precision: 'Option<u8>',
    },
    EVMAppKind: {
      _enum: ['EthApp', 'FaApp', 'HashiBridge', 'XorMaster', 'ValMaster'],
    },
    SubAssetInfo: {
      assetId: 'MainnetAssetId',
      assetKind: 'SubAssetKind',
      precision: 'u8',
    },
    SubAssetKind: {
      _enum: ['Thischain', 'Sidechain'],
    },
    GenericNetworkId: {
      _enum: {
        EVMLegacy: 'u32',
        EVM: 'EVMChainId',
        Sub: 'SubNetworkId',
      },
    },
    MainnetAssetId: 'H256',
    EVMChainId: 'H256',
    SubNetworkId: {
      _enum: {
        Mainnet: null,
        Polkadot: null,
        PolkadotSora: null,
        PolkadotAcala: null,
        PolkadotAssetHub: null,
        PolkadotAstar: null,
        PolkadotMoonbeam: null,
        Kusama: null,
        KusamaSora: null,
        KusamaAssetHub: null,
        KusamaCurio: null,
        KusamaShiden: null,
        Rococo: null,
        RococoSora: null,
        Alphanet: null,
        AlphanetSora: null,
        AlphanetMoonbase: null,
        Liberland: null,
        Custom: 'u32',
      },
    },
  },
  typesAlias: {
    bridgeProxy: {
      AssetKind: 'SubAssetKind',
    },
  },
};
