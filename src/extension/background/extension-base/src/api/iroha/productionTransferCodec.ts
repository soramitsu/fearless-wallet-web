import {
  createIrohaNexusSdkTransferCodec,
  type NexusTransactionCodec,
} from './nexusSdkTransferCodec';
import type { IrohaTransferCodec } from './transfer';

type NativeBrowserTransactionBinding = {
  buildTransferAssetPayload?: (...args: unknown[]) => unknown;
  finalizeSignedTransaction?: (input: Record<string, unknown>) => unknown;
  finalizeTransactionWithSignature?: (input: Record<string, unknown>) => unknown;
};

type IrohaBrowserGlobal = typeof globalThis & {
  __IROHA_NATIVE_BINDING__?: NativeBrowserTransactionBinding;
};

let cachedBinding: NativeBrowserTransactionBinding | undefined;
let cachedCodec: Promise<IrohaTransferCodec> | undefined;

async function loadProductionIrohaTransferCodec(): Promise<IrohaTransferCodec | undefined> {
  if (process.env.VUE_APP_ENABLE_IROHA_TRANSFERS !== 'true') return undefined;

  const binding = (globalThis as IrohaBrowserGlobal).__IROHA_NATIVE_BINDING__;

  if (!hasBrowserTransactionCodec(binding)) return undefined;
  if (cachedBinding === binding && cachedCodec) return cachedCodec;

  cachedBinding = binding;
  cachedCodec = createProductionCodec(binding);

  return cachedCodec;
}

async function requireProductionIrohaTransferCodec(): Promise<IrohaTransferCodec> {
  const codec = await loadProductionIrohaTransferCodec();

  if (!codec) throw new Error('iroha_transfer_codec_unavailable');

  return codec;
}

async function createProductionCodec(binding: NativeBrowserTransactionBinding): Promise<IrohaTransferCodec> {
  const [{ NexusAppClient, nexusPayloadHashHex }, { signEd25519 }] = await Promise.all([
    import('@iroha/iroha-js/nexus-app'),
    import('@iroha/iroha-js/crypto'),
  ]);

  return createIrohaNexusSdkTransferCodec({
    NexusAppClient: NexusAppClient as never,
    payloadHashHex: (payloadBytes) => nexusPayloadHashHex(payloadBytes),
    signEd25519,
    transactionCodec: createNativeTransactionCodec(binding),
  });
}

function createNativeTransactionCodec(binding: NativeBrowserTransactionBinding): NexusTransactionCodec {
  const buildTransferAssetPayload = binding.buildTransferAssetPayload;
  const finalize = binding.finalizeSignedTransaction ?? binding.finalizeTransactionWithSignature;

  if (typeof buildTransferAssetPayload !== 'function' || typeof finalize !== 'function') {
    throw new Error('iroha_transaction_codec_unavailable');
  }

  return {
    buildTransferPayload(input) {
      const result = buildTransferAssetPayload.call(
        binding,
        requireString(input.chainId, 'invalid_iroha_chain_id'),
        requireString(input.authority, 'invalid_iroha_authority'),
        requireString(input.sourceAssetHoldingId ?? input.sourceAssetId, 'invalid_iroha_asset_id'),
        requireString(String(input.quantity ?? ''), 'invalid_iroha_amount'),
        requireString(input.destinationAccountId, 'invalid_iroha_destination'),
        input.metadata == null ? null : JSON.stringify(input.metadata),
        input.creationTimeMs ?? null,
        input.ttlMs ?? null,
        input.nonce ?? null
      );

      return extractBinary(result, ['payloadBytes', 'payload_bytes'], 'invalid_iroha_signable_transaction');
    },
    finalizeSignedTransaction(signable, signature, signingPublicKey) {
      return finalize.call(binding, {
        authority: signable.authority,
        payload_hash_hex: signable.payloadHashHex,
        payloadBytes: signable.payloadBytes,
        payloadHashHex: signable.payloadHashHex,
        publicKey: signingPublicKey,
        signature: signature.signature,
        signatureBytes: signature.signature,
        signingPublicKey,
      }) as ReturnType<NexusTransactionCodec['finalizeSignedTransaction']>;
    },
  };
}

function hasBrowserTransactionCodec(
  binding: NativeBrowserTransactionBinding | undefined
): binding is NativeBrowserTransactionBinding {
  return Boolean(
    binding &&
    typeof binding.buildTransferAssetPayload === 'function' &&
    (typeof binding.finalizeSignedTransaction === 'function' ||
      typeof binding.finalizeTransactionWithSignature === 'function')
  );
}

function requireString(value: unknown, errorCode: string): string {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim()) throw new Error(errorCode);

  return value;
}

function extractBinary(value: unknown, keys: string[], errorCode: string): ArrayBuffer | ArrayBufferView | string {
  if (typeof value === 'string' || value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return value;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;

    for (const key of keys) {
      const candidate = record[key];

      if (typeof candidate === 'string' || candidate instanceof ArrayBuffer || ArrayBuffer.isView(candidate)) {
        return candidate;
      }
    }
  }

  throw new Error(errorCode);
}

function resetProductionIrohaTransferCodecForTest(): void {
  cachedBinding = undefined;
  cachedCodec = undefined;
}

export {
  loadProductionIrohaTransferCodec,
  requireProductionIrohaTransferCodec,
  resetProductionIrohaTransferCodecForTest,
};
export type { NativeBrowserTransactionBinding };
