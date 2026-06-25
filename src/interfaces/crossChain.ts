import { type AssetName } from './assets';
import { type NetworkName, type RelayChainName } from './networks';

type XcmVersion = 'v1' | 'v2' | 'v3';

type Interior = Record<string, string | number | boolean | Record<string, unknown> | unknown[]>;

type Interiors = Interior[];

type XcmLocations = {
  name: RelayChainName;
  chainId: string;
  assets: [
    {
      symbol: string;
      id: string;
      interiors: Interiors;
      versions: XcmVersion[];
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

export { XcmLocations, Interiors, XcmFees, XcmVersion };
