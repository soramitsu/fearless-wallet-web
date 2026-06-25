import { bech32 } from '@scure/base';
import { ripemd160 } from '@noble/hashes/legacy';
import { sha256 } from '@noble/hashes/sha2';
import * as ecc from 'tiny-secp256k1';

import { isBitcoinAddress } from '@/util/bitcoin';
import { deriveBitcoinKey, type BitcoinDerivationNetwork } from '@/util/bitcoinKeyring';

const DEFAULT_SEQUENCE = 0xffffffff;
const SIGHASH_ALL = 0x01;
const P2WPKH_INPUT_VBYTES = 68;
const P2WPKH_OUTPUT_VBYTES = 31;
const TX_LOCKTIME = 0;
const TX_OVERHEAD_VBYTES = 11;
const TX_VERSION = 2;

export const BITCOIN_P2WPKH_DUST_SAT = 330;

export type BitcoinUtxo = {
  address?: string;
  derivationPath?: string;
  scriptPubKey?: string;
  txid: string;
  value: number;
  vout: number;
};

export type BitcoinPaymentOutput = {
  address: string;
  value: number;
};

export type BuildBitcoinTransactionParams = {
  changeAddress?: string;
  feeRateSatPerVbyte?: number;
  feeSat?: number;
  inputs: BitcoinUtxo[];
  mnemonicOrSeed: string;
  network?: BitcoinDerivationNetwork;
  outputs: BitcoinPaymentOutput[];
};

export type BuildBitcoinTransactionResult = {
  change: number;
  fee: number;
  inputTotal: number;
  outputTotal: number;
  txHex: string;
  txid: string;
  vsize: number;
};

type SigningInput = BitcoinUtxo & {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  scriptCode: Uint8Array;
  witnessScript: Uint8Array;
};

type SerializedOutput = {
  script: Uint8Array;
  value: number;
};

export class BitcoinTransactionError extends Error {
  constructor(
    readonly code: string,
    message: string = code,
    readonly details?: unknown
  ) {
    super(message);
    this.name = 'BitcoinTransactionError';
  }
}

export const estimateP2wpkhTransactionVSize = (inputCount: number, outputCount: number): number => {
  if (!Number.isInteger(inputCount) || inputCount <= 0) throw new BitcoinTransactionError('invalid_input_count');
  if (!Number.isInteger(outputCount) || outputCount <= 0) throw new BitcoinTransactionError('invalid_output_count');

  return TX_OVERHEAD_VBYTES + inputCount * P2WPKH_INPUT_VBYTES + outputCount * P2WPKH_OUTPUT_VBYTES;
};

export const buildBitcoinP2wpkhTransaction = ({
  changeAddress,
  feeRateSatPerVbyte,
  feeSat,
  inputs,
  mnemonicOrSeed,
  network = 'mainnet',
  outputs,
}: BuildBitcoinTransactionParams): BuildBitcoinTransactionResult => {
  const normalizedInputs = normalizeInputs(inputs);
  const normalizedOutputs = normalizeOutputs(outputs, network);
  const inputTotal = sumValues(normalizedInputs);
  const paymentOutputTotal = sumValues(normalizedOutputs);
  const fee = normalizeFee({
    feeRateSatPerVbyte,
    feeSat,
    inputCount: normalizedInputs.length,
    outputCount: normalizedOutputs.length + (changeAddress ? 1 : 0),
  });
  const change = inputTotal - paymentOutputTotal - fee;

  if (change < 0) throw new BitcoinTransactionError('insufficient_funds');

  const finalOutputs = [...normalizedOutputs];
  if (change > 0) {
    if (!changeAddress) throw new BitcoinTransactionError('change_address_required');
    if (change < BITCOIN_P2WPKH_DUST_SAT) throw new BitcoinTransactionError('change_below_dust');
    finalOutputs.push(normalizeOutput({ address: changeAddress, value: change }, network));
  }

  const signingInputs = normalizedInputs.map<SigningInput>((input) => {
    const key = deriveBitcoinKey({
      mnemonicOrSeed,
      network,
      path: input.derivationPath,
    });
    const witnessScript = getP2wpkhOutputScript(key.publicKey);

    if (input.address && input.address.toLowerCase() !== key.address.toLowerCase()) {
      throw new BitcoinTransactionError('utxo_address_mismatch');
    }
    if (input.scriptPubKey && input.scriptPubKey.toLowerCase() !== bytesToHex(witnessScript)) {
      throw new BitcoinTransactionError('utxo_script_mismatch');
    }

    return {
      ...input,
      privateKey: key.privateKey,
      publicKey: key.publicKey,
      scriptCode: getP2wpkhScriptCode(key.publicKey),
      witnessScript,
    };
  });
  const serializedOutputs = finalOutputs.map<SerializedOutput>((output) => ({
    script: getP2wpkhOutputScriptFromAddress(output.address),
    value: output.value,
  }));
  const witnesses = signingInputs.map((input) => signP2wpkhInput(signingInputs, serializedOutputs, input));
  const baseTx = serializeTransaction(signingInputs, serializedOutputs);
  const witnessTx = serializeTransaction(signingInputs, serializedOutputs, witnesses);

  return {
    change,
    fee,
    inputTotal,
    outputTotal: paymentOutputTotal,
    txHex: bytesToHex(witnessTx),
    txid: bytesToHex(reverseBytes(doubleSha256(baseTx))),
    vsize: Math.ceil((baseTx.length * 3 + witnessTx.length) / 4),
  };
};

const normalizeInputs = (inputs: BitcoinUtxo[]): BitcoinUtxo[] => {
  if (!Array.isArray(inputs) || inputs.length === 0) throw new BitcoinTransactionError('inputs_required');

  const outpoints = new Set<string>();

  return inputs.map((input) => {
    if (!/^[0-9a-f]{64}$/iu.test(input.txid)) throw new BitcoinTransactionError('invalid_txid');
    if (!Number.isInteger(input.vout) || input.vout < 0 || input.vout > 0xffffffff) {
      throw new BitcoinTransactionError('invalid_vout');
    }
    if (!isSafeSatoshi(input.value) || input.value <= 0) throw new BitcoinTransactionError('invalid_utxo_value');
    if (input.scriptPubKey !== undefined && !/^(?:[0-9a-f]{2})+$/iu.test(input.scriptPubKey)) {
      throw new BitcoinTransactionError('invalid_script_pubkey');
    }
    if (input.derivationPath !== undefined && !/^m(?:\/\d+'?)+$/u.test(input.derivationPath)) {
      throw new BitcoinTransactionError('invalid_derivation_path');
    }

    const outpoint = `${input.txid.toLowerCase()}:${input.vout}`;
    if (outpoints.has(outpoint)) throw new BitcoinTransactionError('duplicate_utxo');
    outpoints.add(outpoint);

    return input;
  });
};

const normalizeOutputs = (outputs: BitcoinPaymentOutput[], network: BitcoinDerivationNetwork): BitcoinPaymentOutput[] => {
  if (!Array.isArray(outputs) || outputs.length === 0) throw new BitcoinTransactionError('outputs_required');

  return outputs.map((output) => normalizeOutput(output, network));
};

const normalizeOutput = (
  output: BitcoinPaymentOutput,
  network: BitcoinDerivationNetwork
): BitcoinPaymentOutput => {
  if (!isBitcoinAddress(output.address, network)) throw new BitcoinTransactionError('invalid_output_address');
  if (!isSafeSatoshi(output.value) || output.value < BITCOIN_P2WPKH_DUST_SAT) {
    throw new BitcoinTransactionError('invalid_output_value');
  }

  return output;
};

const normalizeFee = ({
  feeRateSatPerVbyte,
  feeSat,
  inputCount,
  outputCount,
}: {
  feeRateSatPerVbyte?: number;
  feeSat?: number;
  inputCount: number;
  outputCount: number;
}): number => {
  if (feeSat !== undefined) {
    if (!isSafeSatoshi(feeSat) || feeSat <= 0) throw new BitcoinTransactionError('invalid_fee');

    return feeSat;
  }

  if (feeRateSatPerVbyte === undefined) throw new BitcoinTransactionError('fee_required');
  if (
    typeof feeRateSatPerVbyte !== 'number' ||
    !Number.isFinite(feeRateSatPerVbyte) ||
    feeRateSatPerVbyte <= 0 ||
    feeRateSatPerVbyte > 10_000
  ) {
    throw new BitcoinTransactionError('invalid_fee_rate');
  }

  return Math.ceil(estimateP2wpkhTransactionVSize(inputCount, outputCount) * feeRateSatPerVbyte);
};

const signP2wpkhInput = (
  inputs: SigningInput[],
  outputs: SerializedOutput[],
  input: SigningInput
): Uint8Array[] => {
  const sighash = getBip143SignatureHash(inputs, outputs, input);
  const signature = concatBytes([encodeDERSignature(ecc.sign(sighash, input.privateKey)), Uint8Array.of(SIGHASH_ALL)]);

  return [signature, input.publicKey];
};

const getBip143SignatureHash = (
  inputs: SigningInput[],
  outputs: SerializedOutput[],
  input: SigningInput
): Uint8Array =>
  doubleSha256(
    concatBytes([
      uint32LE(TX_VERSION),
      doubleSha256(concatBytes(inputs.map(serializeOutpoint))),
      doubleSha256(concatBytes(inputs.map(() => uint32LE(DEFAULT_SEQUENCE)))),
      serializeOutpoint(input),
      varSlice(input.scriptCode),
      uint64LE(input.value),
      uint32LE(DEFAULT_SEQUENCE),
      doubleSha256(concatBytes(outputs.map(serializeOutput))),
      uint32LE(TX_LOCKTIME),
      uint32LE(SIGHASH_ALL),
    ])
  );

const serializeTransaction = (
  inputs: SigningInput[],
  outputs: SerializedOutput[],
  witnesses?: Uint8Array[][]
): Uint8Array =>
  concatBytes([
    uint32LE(TX_VERSION),
    ...(witnesses ? [Uint8Array.of(0x00, 0x01)] : []),
    varInt(inputs.length),
    ...inputs.map(serializeInput),
    varInt(outputs.length),
    ...outputs.map(serializeOutput),
    ...(witnesses ?? []).map(serializeWitness),
    uint32LE(TX_LOCKTIME),
  ]);

const serializeInput = (input: SigningInput): Uint8Array =>
  concatBytes([serializeOutpoint(input), varSlice(new Uint8Array()), uint32LE(DEFAULT_SEQUENCE)]);

const serializeOutpoint = ({ txid, vout }: Pick<BitcoinUtxo, 'txid' | 'vout'>): Uint8Array =>
  concatBytes([reverseBytes(hexToBytes(txid)), uint32LE(vout)]);

const serializeOutput = ({ script, value }: SerializedOutput): Uint8Array => concatBytes([uint64LE(value), varSlice(script)]);

const serializeWitness = (witness: Uint8Array[]): Uint8Array =>
  concatBytes([varInt(witness.length), ...witness.map(varSlice)]);

const getP2wpkhOutputScript = (publicKey: Uint8Array): Uint8Array =>
  concatBytes([Uint8Array.of(0x00, 0x14), ripemd160(sha256(publicKey))]);

const getP2wpkhScriptCode = (publicKey: Uint8Array): Uint8Array =>
  concatBytes([Uint8Array.of(0x76, 0xa9, 0x14), ripemd160(sha256(publicKey)), Uint8Array.of(0x88, 0xac)]);

const getP2wpkhOutputScriptFromAddress = (address: string): Uint8Array => {
  try {
    const decoded = bech32.decode(address.toLowerCase() as `${string}1${string}`);
    const program = Uint8Array.from(bech32.fromWords(decoded.words.slice(1)));

    if (decoded.words[0] !== 0 || program.length !== 20) throw new Error('invalid witness program');

    return concatBytes([Uint8Array.of(0x00, 0x14), program]);
  } catch (error) {
    throw new BitcoinTransactionError('invalid_output_address', 'invalid_output_address', error);
  }
};

const encodeDERSignature = (signature: Uint8Array): Uint8Array => {
  if (signature.length !== 64) throw new BitcoinTransactionError('invalid_signature');

  const r = encodeDERInteger(signature.slice(0, 32));
  const s = encodeDERInteger(signature.slice(32, 64));

  return concatBytes([Uint8Array.of(0x30, r.length + s.length), r, s]);
};

const encodeDERInteger = (bytes: Uint8Array): Uint8Array => {
  let offset = 0;

  while (offset < bytes.length - 1 && bytes[offset] === 0) offset += 1;

  const normalized = bytes.slice(offset);

  return normalized[0] & 0x80
    ? concatBytes([Uint8Array.of(0x02, normalized.length + 1, 0x00), normalized])
    : concatBytes([Uint8Array.of(0x02, normalized.length), normalized]);
};

const doubleSha256 = (value: Uint8Array): Uint8Array => sha256(sha256(value));

const varSlice = (value: Uint8Array): Uint8Array => concatBytes([varInt(value.length), value]);

const varInt = (value: number): Uint8Array => {
  if (!Number.isSafeInteger(value) || value < 0) throw new BitcoinTransactionError('invalid_varint');
  if (value < 0xfd) return Uint8Array.of(value);
  if (value <= 0xffff) return concatBytes([Uint8Array.of(0xfd), uint16LE(value)]);
  if (value <= 0xffffffff) return concatBytes([Uint8Array.of(0xfe), uint32LE(value)]);

  return concatBytes([Uint8Array.of(0xff), uint64LE(value)]);
};

const uint16LE = (value: number): Uint8Array => Uint8Array.of(value & 0xff, (value >>> 8) & 0xff);

const uint32LE = (value: number): Uint8Array =>
  Uint8Array.of(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);

const uint64LE = (value: number): Uint8Array => {
  let remaining = BigInt(value);
  const out = new Uint8Array(8);

  for (let index = 0; index < out.length; index += 1) {
    out[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }

  return out;
};

const concatBytes = (chunks: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;

  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }

  return out;
};

const reverseBytes = (value: Uint8Array): Uint8Array => Uint8Array.from(value).reverse();

const hexToBytes = (value: string): Uint8Array => {
  const bytes = new Uint8Array(value.length / 2);

  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }

  return bytes;
};

const bytesToHex = (value: Uint8Array): string =>
  Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('');

const sumValues = (items: Array<{ value: number }>): number => items.reduce((total, { value }) => total + value, 0);

const isSafeSatoshi = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 2_100_000_000_000_000;
