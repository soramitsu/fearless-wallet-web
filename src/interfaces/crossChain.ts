import { AssetName } from './assets';
import { NetworkName, RelayChainName } from './networks';

type Interior = any[];

type Interiors = {
  v1: Interior;
  v2?: Interior;
  v3?: Interior;
};

type XcmLocations = {
  name: RelayChainName;
  chainId: string;
  assets: [
    {
      nativeParachainIds: number[];
      symbol: string;
      parents: number;
      interiors: Interiors;
    }
  ];
}[];

type XcmFees = {
  chainId: string;
  destChain: NetworkName;
  destXcmFee: {
    feeInPlanks: string;
    symbol: AssetName;
    precision: string;
  }[];
  weight: string;
}[];

export { XcmLocations, Interior, XcmFees };
