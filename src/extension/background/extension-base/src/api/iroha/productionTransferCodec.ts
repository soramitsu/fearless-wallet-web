import { createIrohaNexusSdkTransferCodec } from './nexusSdkTransferCodec';
import type { IrohaTransferCodec } from './transfer';

let cachedCodec: Promise<IrohaTransferCodec> | undefined;
const LEGACY_OFFLINE_COMPATIBILITY = 'legacy-offline-only';

async function loadProductionIrohaTransferCodec(): Promise<IrohaTransferCodec | undefined> {
  if (process.env.VUE_APP_ENABLE_IROHA_TRANSFERS !== 'true') return undefined;
  if (process.env.VUE_APP_IROHA_TRANSFER_COMPATIBILITY !== LEGACY_OFFLINE_COMPATIBILITY) {
    throw new Error('iroha_transfer_codec_profile_invalid');
  }

  if (cachedCodec) return cachedCodec;

  cachedCodec = createProductionCodec();

  return cachedCodec;
}

async function requireProductionIrohaTransferCodec(): Promise<IrohaTransferCodec> {
  const codec = await loadProductionIrohaTransferCodec();

  if (!codec) throw new Error('iroha_transfer_codec_unavailable');

  return codec;
}

async function createProductionCodec(): Promise<IrohaTransferCodec> {
  const [{ NexusAppClient, nexusPayloadHashHex }, { signEd25519 }, { browserTransactionCodec }] = await Promise.all([
    import('@iroha/iroha-js-transfer-codec/nexus-app'),
    import('@iroha/iroha-js-transfer-codec/crypto'),
    import('@iroha/iroha-js-transfer-codec/transaction-codec'),
  ]);

  return createIrohaNexusSdkTransferCodec({
    NexusAppClient: NexusAppClient as never,
    payloadHashHex: (payloadBytes) => nexusPayloadHashHex(payloadBytes),
    signEd25519,
    transactionCodec: browserTransactionCodec,
  });
}

function resetProductionIrohaTransferCodecForTest(): void {
  cachedCodec = undefined;
}

export {
  loadProductionIrohaTransferCodec,
  requireProductionIrohaTransferCodec,
  resetProductionIrohaTransferCodecForTest,
};
