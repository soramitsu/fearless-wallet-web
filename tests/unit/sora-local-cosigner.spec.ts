import { beforeAll, describe, expect, it, vi } from 'vitest';
import { cryptoWaitReady, sr25519PairFromSeed } from '@polkadot/util-crypto';
import { decryptForCosigner, encryptForCosigners } from '@/sora/cosigner';

beforeAll(async () => { await cryptoWaitReady(); });
describe('local legacy cosigner envelopes', () => {
  it('round trips with the recipient secret and has no network side effects', () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    const sender = sr25519PairFromSeed(new Uint8Array(32).fill(1));
    const recipient = sr25519PairFromSeed(new Uint8Array(32).fill(2));
    const payload = JSON.stringify('0x010203');
    const a = encryptForCosigners(payload, { recipient: recipient.publicKey }, sender.secretKey);
    const b = encryptForCosigners(payload, { recipient: recipient.publicKey }, sender.secretKey);
    expect(a.encryptedData).not.toBe(b.encryptedData);
    expect(decryptForCosigner('recipient', sender.publicKey, a, recipient.secretKey)).toBe('0x010203');
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  });
  it('rejects the wrong recipient, malformed envelopes and invalid keys', () => {
    const sender = sr25519PairFromSeed(new Uint8Array(32).fill(1));
    const recipient = sr25519PairFromSeed(new Uint8Array(32).fill(2));
    const envelope = encryptForCosigners(JSON.stringify('0x01'), { recipient: recipient.publicKey }, sender.secretKey);
    expect(() => decryptForCosigner('missing', sender.publicKey, envelope, recipient.secretKey)).toThrow();
    expect(() => decryptForCosigner('recipient', sender.publicKey, { ...envelope, dataIv: '00' }, recipient.secretKey)).toThrow();
    expect(() => encryptForCosigners('x', { recipient: new Uint8Array(31) }, sender.secretKey)).toThrow();
    expect(() => decryptForCosigner('recipient', sender.publicKey, envelope, sender.secretKey)).toThrow();
  });
});
