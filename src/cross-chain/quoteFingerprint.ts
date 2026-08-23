import { blake2AsHex } from '@polkadot/util-crypto';
import type { CrossChainProps } from '@extension-base/api/substrate/types';

/** Binds a reviewed runtime call quote to the exact user-confirmed route and transaction inputs. */
export function createCrossChainQuoteFingerprint({
  props,
  originChainId,
  destinationChainId,
  substrateAddress,
  precisionAmount,
  runtimeFingerprint,
}: {
  props: CrossChainProps;
  originChainId: string;
  destinationChainId: string;
  substrateAddress: string;
  precisionAmount: string;
  runtimeFingerprint: string;
}): string {
  return blake2AsHex(
    JSON.stringify({
      version: 1,
      routeId: props.routeId,
      providerId: props.routeProviderId,
      assetKey: props.assetKey,
      assetId: props.assetId,
      xcmAssetId: props.xcmAssetId,
      originChainId,
      destinationChainId,
      from: substrateAddress,
      to: props.to,
      precisionAmount,
      runtimeFingerprint,
    })
  );
}
