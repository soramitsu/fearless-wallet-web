import { readFileSync } from 'node:fs';
import path from 'node:path';

// Production send flags are not configurable through the environment: a send is enabled exactly
// when its live-network evidence manifest is ready and release-enabled. The manifest audits run by
// CI and `prepare:chrome-release` verify the recorded evidence itself.
export const TRANSFER_EVIDENCE_MANIFESTS = Object.freeze({
  VUE_APP_ENABLE_BITCOIN_TRANSFERS: 'scripts/bitcoin-testnet-broadcast-evidence.json',
  VUE_APP_ENABLE_IROHA_TRANSFERS: 'config/iroha-production-send-readiness.json',
});

export function readReleaseTransferFlags(rootDir) {
  return Object.fromEntries(
    Object.entries(TRANSFER_EVIDENCE_MANIFESTS).map(([flag, manifestPath]) => {
      const manifest = JSON.parse(readFileSync(path.join(rootDir, manifestPath), 'utf8'));

      return [flag, manifest.status === 'ready' && manifest.releaseEnabled === true ? 'true' : 'false'];
    })
  );
}
