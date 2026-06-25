import { base58Decode } from '@polkadot/util-crypto';
import vectors from '../../docs/universal-wallet-v2-vectors.json';
import {
  getSolanaSerializedMessageBase64,
  parseSolanaSerializedTransaction,
  signSolanaSerializedTransaction,
  SolanaTransactionError,
} from '@/util/solanaTransaction';

const vector = vectors.vectors[0];
const expected = vector.expected.solana;
const otherVector = vectors.vectors[1];
const SYSTEM_PROGRAM = '11111111111111111111111111111111';

function compact(value: number): number[] {
  const result: number[] = [];
  let next = value;

  do {
    let byte = next & 0x7f;

    next >>= 7;
    if (next > 0) byte |= 0x80;
    result.push(byte);
  } while (next > 0);

  return result;
}

function bytes(...chunks: Array<number[] | Uint8Array>): Uint8Array {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

function key(address: string): Uint8Array {
  return base58Decode(address);
}

function legacyMessage({
  accountKeys = [expected.address, SYSTEM_PROGRAM],
  instructionData = [],
  requiredSignatures = 1,
}: {
  accountKeys?: string[];
  instructionData?: number[];
  requiredSignatures?: number;
} = {}): Uint8Array {
  const readonlyUnsignedAccounts = accountKeys.length > requiredSignatures ? 1 : 0;

  return bytes(
    [requiredSignatures, 0, readonlyUnsignedAccounts],
    compact(accountKeys.length),
    ...accountKeys.map(key),
    new Uint8Array(32).fill(9),
    compact(1),
    [1],
    compact(1),
    [0],
    compact(instructionData.length),
    instructionData
  );
}

function v0Message(): Uint8Array {
  return bytes(
    [0x80],
    [1, 0, 1],
    compact(2),
    key(expected.address),
    key(SYSTEM_PROGRAM),
    new Uint8Array(32).fill(7),
    compact(0),
    compact(0)
  );
}

function transaction(message: Uint8Array, signatureCount = 1): Uint8Array {
  return bytes(compact(signatureCount), new Uint8Array(signatureCount * 64), message);
}

function base64(value: Uint8Array): string {
  return Buffer.from(value).toString('base64');
}

function errorCode(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    if (error instanceof SolanaTransactionError) return error.code;

    throw error;
  }

  throw new Error('Expected SolanaTransactionError');
}

describe('Solana serialized transaction signing', () => {
  it('parses and signs legacy serialized transactions', () => {
    const raw = transaction(legacyMessage());
    const parsed = parseSolanaSerializedTransaction(raw);

    expect(parsed.version).toBe('legacy');
    expect(parsed.requiredSignatures).toBe(1);
    expect(parsed.accountKeys).toEqual([expected.address, SYSTEM_PROGRAM]);
    expect(parsed.addressTableLookupCount).toBe(0);
    expect(parsed.instructionCount).toBe(1);
    expect(parsed.readonlySignedAccounts).toBe(0);
    expect(parsed.readonlyUnsignedAccounts).toBe(1);
    expect(parsed.recentBlockhash).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
    expect(getSolanaSerializedMessageBase64(raw)).toBe(base64(parsed.messageBytes));

    const signed = signSolanaSerializedTransaction({
      expectedSigner: expected.address,
      mnemonic: vector.mnemonic,
      transaction: raw,
    });

    expect(signed.version).toBe('legacy');
    expect(signed.signer).toBe(expected.address);
    expect(signed.signatureBase58).toMatch(/^[1-9A-HJ-NP-Za-km-z]{64,128}$/);
    expect([...signed.signedTransaction.slice(1, 65)]).not.toEqual([...new Uint8Array(64)]);
    expect(signed.signedTransaction.slice(65)).toEqual(raw.slice(65));
  });

  it('parses and signs v0 serialized transactions from base64 input', () => {
    const raw = transaction(v0Message());
    const parsed = parseSolanaSerializedTransaction(raw);
    const signed = signSolanaSerializedTransaction({
      mnemonic: vector.mnemonic,
      transaction: base64(raw),
    });

    expect(parsed.version).toBe(0);
    expect(parsed.addressTableLookupCount).toBe(0);
    expect(parsed.instructionCount).toBe(0);
    expect(signed.version).toBe(0);
    expect(signed.signedTransactionBase64).toBe(base64(signed.signedTransaction));
    expect([...signed.signedTransaction.slice(1, 65)]).not.toEqual([...new Uint8Array(64)]);
  });

  it('rejects malformed transaction envelopes and messages', () => {
    expect(errorCode(() => parseSolanaSerializedTransaction(new Uint8Array()))).toBe('empty_transaction');
    expect(errorCode(() => parseSolanaSerializedTransaction('*not-base64*'))).toBe('invalid_transaction_base64');
    expect(errorCode(() => parseSolanaSerializedTransaction(new Uint8Array([0])))).toBe('missing_signature_slot');
    expect(errorCode(() => parseSolanaSerializedTransaction(new Uint8Array([1, 2, 3])))).toBe('truncated_signatures');
    expect(errorCode(() => parseSolanaSerializedTransaction(transaction(new Uint8Array([0x81, 1, 0, 0]))))).toBe(
      'unsupported_transaction_version'
    );
    expect(
      errorCode(() =>
        parseSolanaSerializedTransaction(transaction(bytes([2, 0, 0], compact(1), key(expected.address))))
      )
    ).toBe('invalid_required_signature_count');
    expect(errorCode(() => parseSolanaSerializedTransaction(transaction(bytes(legacyMessage(), [1]))))).toBe(
      'trailing_message_bytes'
    );
  });

  it('rejects unsafe signer and signature-slot states', () => {
    expect(
      errorCode(() =>
        signSolanaSerializedTransaction({
          expectedSigner: otherVector.expected.solana.address,
          mnemonic: vector.mnemonic,
          transaction: transaction(legacyMessage()),
        })
      )
    ).toBe('signer_mismatch');
    expect(
      errorCode(() =>
        signSolanaSerializedTransaction({
          mnemonic: otherVector.mnemonic,
          transaction: transaction(legacyMessage()),
        })
      )
    ).toBe('signer_not_found');
    expect(
      errorCode(() =>
        signSolanaSerializedTransaction({
          mnemonic: vector.mnemonic,
          transaction: transaction(
            legacyMessage({
              accountKeys: [SYSTEM_PROGRAM, expected.address],
            })
          ),
        })
      )
    ).toBe('signer_not_required');
    expect(
      errorCode(() =>
        signSolanaSerializedTransaction({
          mnemonic: vector.mnemonic,
          transaction: transaction(
            legacyMessage({
              accountKeys: [expected.address, SYSTEM_PROGRAM],
              requiredSignatures: 2,
            }),
            1
          ),
        })
      )
    ).toBe('missing_required_signature_slots');
  });
});
