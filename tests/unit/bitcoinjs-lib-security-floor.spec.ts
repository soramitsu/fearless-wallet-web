import { createRequire } from 'node:module';

import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';

// The installed bitcoinjs-lib must keep the 6.x security backports. The wallet builds and signs its own Bitcoin
// transactions (src/util/bitcoinTransaction.ts) and reads saved ones with `Transaction`, but @subwallet/keyring
// loads the same copy for its PSBT signer and address code, so a lockfile that resolves an older 6.1.x brings the
// fixed bugs back for anything that reaches them. Each case names the release that fixed it.

// Vite gives test code the browser Buffer polyfill, while vitest loads bitcoinjs-lib from node_modules with Node's own
// Buffer, the only one its type checks accept.
const { Buffer: NodeBuffer } = createRequire(import.meta.url)('node:buffer') as typeof import('node:buffer');

const privateKey = NodeBuffer.from('11'.repeat(32), 'hex');
const publicKey = NodeBuffer.from(ecc.pointFromScalar(privateKey, true)!);
const signer = {
  publicKey,
  sign: (hash: Buffer): Buffer => NodeBuffer.from(ecc.sign(hash, privateKey)),
};
const network = bitcoin.networks.testnet;
const ownScript = bitcoin.payments.p2wpkh({ pubkey: publicKey, network }).output!;
const recipientScript = bitcoin.payments.p2wpkh({ hash: NodeBuffer.alloc(20, 0x22), network }).output!;

const FUNDED_SAT = 10_000;
const SENT_SAT = 9_000;

const fundingTransaction = (): bitcoin.Transaction => {
  const transaction = new bitcoin.Transaction();

  transaction.version = 2;
  transaction.addInput(NodeBuffer.alloc(32, 0x33), 0);
  transaction.addOutput(ownScript, FUNDED_SAT);

  return transaction;
};

const spendOf = (funding: bitcoin.Transaction, witnessUtxoValue?: number): bitcoin.Psbt => {
  const psbt = new bitcoin.Psbt({ network });

  psbt.addInput({
    hash: funding.getId(),
    index: 0,
    nonWitnessUtxo: funding.toBuffer(),
    ...(witnessUtxoValue === undefined ? {} : { witnessUtxo: { script: ownScript, value: witnessUtxoValue } }),
  });
  psbt.addOutput({ script: recipientScript, value: SENT_SAT });

  return psbt;
};

const header = (bits: number, nonce = 0): bitcoin.Block => {
  const block = new bitcoin.Block();

  block.version = 2;
  block.prevHash = NodeBuffer.alloc(32, 0x44);
  block.merkleRoot = NodeBuffer.alloc(32, 0x55);
  block.timestamp = 1_700_000_000;
  block.bits = bits;
  block.nonce = nonce;

  return block;
};

const payment = (marker: number): bitcoin.Transaction => {
  const transaction = new bitcoin.Transaction();

  transaction.version = 2;
  transaction.addInput(NodeBuffer.alloc(32, marker), 0);
  transaction.addOutput(recipientScript, 1_000 + marker);

  return transaction;
};

describe('installed bitcoinjs-lib security backports', () => {
  it('is the reviewed 6.1.x release', async () => {
    const { version } = (await import('bitcoinjs-lib/package.json')).default;
    const [major, minor, patch] = version.split('.').map(Number);

    expect([major, minor]).toEqual([6, 1]);
    expect(patch).toBeGreaterThanOrEqual(10);
  });

  describe('PSBT input UTXOs (6.1.9)', () => {
    it('signs and accounts the fee from matching witness and non-witness UTXOs', () => {
      const psbt = spendOf(fundingTransaction(), FUNDED_SAT);

      psbt.signInput(0, signer);
      psbt.finalizeAllInputs();

      expect(psbt.getFee()).toBe(FUNDED_SAT - SENT_SAT);
    });

    it('refuses a witness UTXO whose amount differs from the previous transaction', () => {
      // Before 6.1.9 the signature committed to the real 10,000 sat while the fee was read from the claimed amount.
      const psbt = spendOf(fundingTransaction(), 1_000_000);

      expect(() => psbt.signInput(0, signer)).toThrow("Witness UTXO for input #0 doesn't match the non-witness UTXO");
      expect(() => psbt.getInputType(0)).toThrow("Witness UTXO for input #0 doesn't match the non-witness UTXO");
    });

    it('refuses a previous transaction that is not the one the input spends', () => {
      const other = fundingTransaction();

      other.locktime = 1;

      const psbt = new bitcoin.Psbt({ network });

      psbt.addInput({ hash: fundingTransaction().getId(), index: 0, nonWitnessUtxo: other.toBuffer() });
      psbt.addOutput({ script: recipientScript, value: SENT_SAT });

      // Before 6.1.9 only signing compared the hashes; reading the input's script trusted the supplied transaction.
      expect(() => psbt.getInputType(0)).toThrow(
        "Non-witness UTXO hash for input #0 doesn't match the hash specified in the prevout"
      );
    });
  });

  describe('block proof of work (6.1.10)', () => {
    it('accepts a hash below a valid target', () => {
      // 0x207fffff is the regtest limit: about half of all hashes are below it.
      const accepted = Array.from({ length: 64 }, (_, nonce) => header(0x207fffff, nonce).checkProofOfWork());

      expect(accepted).toContain(true);
      expect(accepted).toContain(false);
    });

    it('rejects a negative compact target', () => {
      // The same mantissa and size as above with the sign bit set.
      const accepted = Array.from({ length: 64 }, (_, nonce) => header(0x20ffffff, nonce).checkProofOfWork());

      expect(accepted).not.toContain(true);
    });

    it('rejects a zero compact target', () => {
      expect(header(0x20000000).checkProofOfWork()).toBe(false);
      expect(header(0x00000000).checkProofOfWork()).toBe(false);
      expect(header(0x01003456).checkProofOfWork()).toBe(false);
    });

    it('rejects a compact target that overflows 256 bits instead of throwing', () => {
      expect(header(0x21010000).checkProofOfWork()).toBe(false);
      expect(header(0x22000100).checkProofOfWork()).toBe(false);
      expect(header(0x23000001).checkProofOfWork()).toBe(false);
      expect(header(0xff000001).checkProofOfWork()).toBe(false);
    });
  });

  describe('block Merkle root (6.1.8)', () => {
    it('rejects a transaction list padded with a duplicate pair', () => {
      const transactions = [payment(1), payment(2), payment(3)];
      const block = header(0x207fffff);

      block.transactions = transactions;
      block.merkleRoot = bitcoin.Block.calculateMerkleRoot(transactions);
      expect(block.checkTxRoots()).toBe(true);

      // CVE-2012-2459: repeating the last transaction gives the same root as the odd-length list.
      block.transactions = [...transactions, transactions[2]];
      expect(bitcoin.Block.calculateMerkleRoot(block.transactions).equals(block.merkleRoot)).toBe(true);
      expect(block.checkTxRoots()).toBe(false);
    });
  });
});
