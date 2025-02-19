import type { BasicTxResponse, TokenGroup } from '@extension-base/background/types/types';
import type { SubmittableExtrinsic } from '@polkadot/api/types';
import type { NetworkName, RelayChainName } from '@/interfaces';

interface CrossChainProps {
  assetId: string;
  originNet: NetworkName;
  destinationNet: NetworkName;
  to: string;
  from: string;
  amount: string;
  tokenBalance: TokenGroup;
}

interface MakeCrossChainProps extends CrossChainProps {
  callback?: (data: BasicTxResponse) => void;
  relayChain?: RelayChainName;
  isMobile: boolean;
}

type ExtrinsicTransferProps = {
  to: string;
  amount: string | undefined;
  networkKey: NetworkName;
  tokenBalance: TokenGroup;
};

type Extrinsic = Nullable<SubmittableExtrinsic<'promise'>>;

export { ExtrinsicTransferProps, Extrinsic, MakeCrossChainProps, CrossChainProps };
