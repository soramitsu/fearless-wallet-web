import { NetworkId } from '@iroha/iroha-js/browser';
import {
  browserTransactionPayloadHashHex,
  buildBrowserTransferPayload,
  finalizeBrowserSignedTransaction,
} from '@iroha/iroha-js/transaction-codec';
import { ed25519 } from '@noble/curves/ed25519';

import type { IrohaSignedTransaction, IrohaTransferCodec, IrohaTransferCodecInput } from './transfer';
import { deriveIrohaSigningKey } from '@/util/irohaKeyring';

// Norito V1 frame header that Torii counts toward the per-byte fee (`tx_bytes_len`).
const NORITO_FRAME_HEADER_BYTES = 40;

type IrohaTransferPayloadInput = Omit<IrohaTransferCodecInput, 'derivationPath' | 'mnemonicOrSeed'>;

function buildTransferPayload(input: IrohaTransferPayloadInput): Uint8Array {
  return buildBrowserTransferPayload({
    networkId: NetworkId.parse(input.networkId),
    networkPrefix: input.networkPrefix,
    authority: input.authority,
    sourceAssetHoldingId: input.sourceAssetId,
    quantity: input.amount,
    destinationAccountId: input.destinationAccountId,
    feePayment: {
      payer: 'authority',
      chargeLimits: [{ kind: 'nexus', assetDefinitionId: input.feeAssetDefinitionId, maxAmount: input.maxFee }],
      gasLimit: null,
    },
    creationTimeMs: input.creationTimeMs,
    ttlMs: input.ttlMs,
  });
}

// Size Torii charges per-byte fees on; independent of the signature and creation time.
function getIrohaTransferFrameBytes(input: IrohaTransferPayloadInput): number {
  return buildTransferPayload(input).byteLength + NORITO_FRAME_HEADER_BYTES;
}

const browserIrohaTransferCodec: IrohaTransferCodec = {
  async buildAndSignTransfer(input: IrohaTransferCodecInput): Promise<IrohaSignedTransaction> {
    const signingKey = deriveIrohaSigningKey({ mnemonic: input.mnemonicOrSeed, path: input.derivationPath });

    try {
      if (signingKey.publicKeyHex.toLowerCase() !== input.signingPublicKeyHex.toLowerCase()) {
        throw new Error('iroha_signing_key_mismatch');
      }

      const networkId = NetworkId.parse(input.networkId);
      const payloadBytes = buildTransferPayload(input);
      const payloadHashHex = browserTransactionPayloadHashHex(payloadBytes, input.networkPrefix);
      const publicKey = hexToBytes(signingKey.publicKeyHex);
      const signature = ed25519.sign(hexToBytes(payloadHashHex), signingKey.privateKeySeed);
      // Finalization re-validates the payload, authority, key and signature before returning bytes.
      const finalized = finalizeBrowserSignedTransaction(
        {
          networkId,
          networkPrefix: input.networkPrefix,
          payloadBytes,
          payloadHashHex,
          authority: input.authority,
          signingPublicKey: publicKey,
          signatureAlgorithm: 'ed25519',
        },
        signature,
        publicKey
      );

      return {
        signedTransaction: new Uint8Array(finalized.signedTransaction),
        signedTransactionHashHex: finalized.hashHex,
      };
    } finally {
      signingKey.privateKeySeed.fill(0);
    }
  },
};

async function requireProductionIrohaTransferCodec(): Promise<IrohaTransferCodec> {
  return browserIrohaTransferCodec;
}

function hexToBytes(hex: string): Uint8Array {
  const digits = hex.startsWith('0x') ? hex.slice(2) : hex;

  if (!/^(?:[0-9a-fA-F]{2})+$/u.test(digits)) throw new Error('invalid_iroha_hex');

  return Uint8Array.from(digits.match(/../gu) ?? [], (pair) => Number.parseInt(pair, 16));
}

export { browserIrohaTransferCodec, getIrohaTransferFrameBytes, requireProductionIrohaTransferCodec };
