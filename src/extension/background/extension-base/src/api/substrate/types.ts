import type { BasicTxResponse, TokenGroup } from '@extension-base/background/types/types';
import type { SubmittableExtrinsic } from '@polkadot/api/types';
import type { NetworkName, RelayChainName } from '@/interfaces';
import type { CrossChainRouteProviderId, ReviewedCrossChainExecution } from '@/cross-chain/reviewedRoutes';
import type { KeyringPair } from '@subwallet/keyring/types';

interface CrossChainProps {
  assetId: string;
  /** Canonical identity and reviewed provider selection bound into the quote fingerprint. */
  assetKey: string;
  routeId: string;
  routeProviderId: CrossChainRouteProviderId;
  /** Bundled reviewed XCM identity; never derived from mutable network JSON at execution time. */
  xcmAssetId: string;
  /** Complete bundled pallet/call/multilocation authority. */
  execution: Readonly<ReviewedCrossChainExecution>;
  reviewedMinimum: string | null;
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
  expectedOriginFee: string;
  expectedDestinationFee: string;
  expectedExecutionFingerprint: string;
  capturedPair: KeyringPair;
}

type ExtrinsicTransferProps = {
  to: string;
  amount: string | undefined;
  networkKey: NetworkName;
  tokenBalance: TokenGroup;
};

type Extrinsic = Nullable<SubmittableExtrinsic<'promise'>>;

export { ExtrinsicTransferProps, Extrinsic, MakeCrossChainProps, CrossChainProps };
