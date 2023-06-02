import { AssetName } from './assets';
import { NetworkName, RelayChainName } from './networks';

type Interior = any[];

type Interiors = {
  v1: Interior;
  v3?: Interior;
};

type XcmLocations = {
  name: RelayChainName;
  chainId: string;
  assets: [
    {
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
  }[];
  weight: string;
}[];

export { XcmLocations, Interior, XcmFees };
