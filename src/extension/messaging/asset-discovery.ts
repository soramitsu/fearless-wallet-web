import type { AssetDiscoverySweepResult } from '@extension-base/services/asset-discovery-service';
import { sendMessage } from '@/extension/messaging/index';

export function forceAssetDiscoverySweep(): Promise<AssetDiscoverySweepResult> {
  return sendMessage('pri(asset.discovery.sweep)');
}
