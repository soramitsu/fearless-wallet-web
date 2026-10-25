import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { NetworkId } from '@iroha/iroha-js/browser';
import { buildBrowserTransferPayload } from '@iroha/iroha-js/transaction-codec';

import { getNativeBinding } from '@/util/irohaSdkBrowserBinding';
import { getIrohaCanonicalHex } from '@/util/iroha';
import {
  addIrohaQuantities,
  canonicalizeIrohaQuantity,
  compareIrohaQuantities,
  getIrohaQuantityScale,
  multiplyIrohaQuantity,
} from '@/util/irohaQuantity';
import { IROHA_TRANSACTION_WIRE, UNIVERSAL_WALLET_IROHA_NETWORKS } from '@/consts/universalWallet';

const fixture = JSON.parse(readFileSync(resolve(__dirname, '../../docs/universal-wallet-v2-vectors.json'), 'utf8')) as {
  vectors: Array<{ expected: { iroha: { nexus: { i105: string }; taira: { i105: string; publicKeyHex: string } } } }>;
};

const TAIRA = fixture.vectors[0].expected.iroha.taira;
const NEXUS = fixture.vectors[0].expected.iroha.nexus;
const COUNTERPARTY = fixture.vectors[1].expected.iroha.taira.i105;
const XOR = UNIVERSAL_WALLET_IROHA_NETWORKS.taira.nativeAsset.id;

describe('Iroha SDK browser address binding', () => {
  const binding = getNativeBinding();

  it('parses and renders the cross-client I105 vectors byte-for-byte', () => {
    const parsed = binding.accountAddressParseEncoded(TAIRA.i105, 369);
    const canonicalHex = `0x${Array.from(parsed.canonicalBytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;

    expect(parsed.networkPrefix).toBe(369);
    expect(canonicalHex).toBe(getIrohaCanonicalHex(TAIRA.publicKeyHex));
    expect(binding.accountAddressRender(parsed.canonicalBytes, 369)).toEqual({ canonicalHex, i105: TAIRA.i105 });
    expect(binding.accountAddressRender(parsed.canonicalBytes, 753).i105).toBe(NEXUS.i105);
  });

  it('reports SDK-style error codes for foreign prefixes and malformed literals', () => {
    expect(() => binding.accountAddressParseEncoded(NEXUS.i105, 369)).toThrow(/^UNEXPECTED_NETWORK_PREFIX: /u);
    expect(() => binding.accountAddressParseEncoded(`${TAIRA.i105}x`)).toThrow(/^[A-Z_]+: /u);
    expect(Object.isFrozen(binding)).toBe(true);
  });

  it('lets the bundled SDK codec encode only canonical Taira accounts', () => {
    const transfer = (authority: string) =>
      buildBrowserTransferPayload({
        networkId: NetworkId.parse(UNIVERSAL_WALLET_IROHA_NETWORKS.taira.networkId),
        networkPrefix: 369,
        authority,
        sourceAssetHoldingId: `${XOR}#${authority}`,
        quantity: '1',
        destinationAccountId: COUNTERPARTY,
        feePayment: {
          payer: 'authority',
          chargeLimits: [{ kind: 'nexus', assetDefinitionId: XOR, maxAmount: '0.01' }],
          gasLimit: null,
        },
        creationTimeMs: 1,
        ttlMs: 60_000,
      });

    expect(transfer(TAIRA.i105).byteLength).toBeGreaterThan(0);
    expect(() => transfer(NEXUS.i105)).toThrow();
  });

  it('pins the wire constants to the vendored SDK release', () => {
    const sdkSource = readFileSync(
      resolve(__dirname, '../../node_modules/@iroha/iroha-js/dist/smartContractDeployment.js'),
      'utf8'
    );

    expect(sdkSource).toContain(`CURRENT_DATA_MODEL_VERSION = ${IROHA_TRANSACTION_WIRE.dataModelVersion};`);
    expect(sdkSource).toContain(`"${IROHA_TRANSACTION_WIRE.signedTransactionSchemaHash}"`);
  });
});

describe('Iroha exact quantities', () => {
  it('adds, multiplies and compares without floating point', () => {
    expect(addIrohaQuantities('0.1', '0.2')).toBe('0.3');
    expect(addIrohaQuantities('0', '0.001', '0.009')).toBe('0.01');
    expect(multiplyIrohaQuantity('0.00005', 180)).toBe('0.009');
    expect(multiplyIrohaQuantity('0.000001', 0)).toBe('0');
    expect(compareIrohaQuantities('12.34', '12.35')).toBe(-1);
    expect(compareIrohaQuantities('1.50', '1.5')).toBe(0);
    expect(canonicalizeIrohaQuantity('12.3400')).toBe('12.34');
    expect(canonicalizeIrohaQuantity('5.000')).toBe('5');
    expect(getIrohaQuantityScale('1.2300')).toBe(2);
  });

  it.each(['', '-1', '1.', '.1', '01', '1e3', ' 1', `1.${'1'.repeat(29)}`])('rejects %j', (value) => {
    expect(() => canonicalizeIrohaQuantity(value)).toThrow('invalid_iroha_quantity');
  });
});
