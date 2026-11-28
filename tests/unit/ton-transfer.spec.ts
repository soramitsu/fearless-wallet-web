import { describe, expect, it, vi } from 'vitest';
import { Address, beginCell, type MessageRelaxed } from '@ton/core';
import { makeTonTransfer, maxTonTransferFee } from '@extension-base/api/ton/transfer';

function setup(precision = 6, jetton = true, { recipientStatus = 'nonexist', to }: { recipientStatus?: string | Error; to?: string } = {}) {
  const owner = new Address(0, Buffer.alloc(32, 1));
  const recipient = new Address(0, Buffer.alloc(32, 2));
  const jettonWallet = new Address(0, Buffer.alloc(32, 3));
  const createTransfer = vi.fn((_params: { messages: MessageRelaxed[] }) => beginCell().endCell());
  const broadcast = vi.fn().mockResolvedValue(undefined);
  const decodeMnemonicVerified = vi.fn().mockResolvedValue('fixture mnemonic');
  const getAccountStatus = vi.fn(async () => {
    if (recipientStatus instanceof Error) throw recipientStatus;

    return recipientStatus;
  });
  const state = {
    getTonApiMap: { ton: { api: {
      broadcaster: async () => ({
        getWalletState: async () => ({ seqno: 1, deployed: true }),
        getAccountStatus,
        sendMessage: broadcast,
      }),
    } } },
    keyringService: { tonKeyring: {
      accountSubject: { value: { [owner.toString()]: {
        walletContract: { address: owner, createTransfer }, publicKey: Buffer.alloc(32),
      } } },
      decodeMnemonicVerified,
      mnemonicToKeyPair: async () => ({ secretKey: Buffer.alloc(64) }),
    } },
  };
  const send = (amount: string) => makeTonTransfer({
    networkKey: 'ton', from: owner.toString(), to: to ?? recipient.toString(), amount, assetId: 'token',
    balance: { ...(jetton ? { walletAddress: jettonWallet } : {}), precision } as never,
  }, state as never);

  return { broadcast, createTransfer, decodeMnemonicVerified, getAccountStatus, jettonWallet, recipient, send };
}

describe('TON transfer amounts', () => {
  it.each([
    [6, '1', 1_000_000n],
    [6, '1.123456', 1_123_456n],
    [6, '1.123456000', 1_123_456n],
    [9, '0.000000001', 1n],
    [0, '12', 12n],
    [18, '1.000000000000000001', 1_000_000_000_000_000_001n],
    [6, '9007199254740993.123456', 9_007_199_254_740_993_123_456n],
  ])('encodes a %i-decimal jetton amount %s exactly', async (precision, amount, units) => {
    const { broadcast, createTransfer, jettonWallet, send } = setup(precision);
    await send(amount);

    const message = createTransfer.mock.calls[0][0].messages[0];
    expect(message.info.type).toBe('internal');
    if (message.info.type !== 'internal') throw new Error('Expected an internal transfer');
    expect(message.info.dest.toRawString()).toBe(jettonWallet.toRawString());
    // Enough for a TEP-74 jetton wallet, which refuses less than about 0.03 TON; a refusal bounces it back.
    expect(message.info.value.coins).toBe(50_000_000n);
    expect(message.info.bounce).toBe(true);
    const body = message.body.beginParse();
    expect(body.loadUint(32)).toBe(0x0f8a7ea5);
    body.loadUintBig(64);
    expect(body.loadCoins()).toBe(units);
    expect(broadcast).toHaveBeenCalledOnce();
  });

  it.each([
    [6, '0.0000001'], [0, '1.1'], [6, '-1'], [6, '1e3'], [6, 'NaN'],
    [-1, '1'], [1.5, '1'], [256, '1'], [Number.NaN, '1'],
  ])('rejects invalid precision %s or amount %s before unlocking or signing', async (precision, amount) => {
    const { broadcast, createTransfer, decodeMnemonicVerified, send } = setup(precision);
    await expect(send(amount)).rejects.toThrow();
    expect(decodeMnemonicVerified).not.toHaveBeenCalled();
    expect(createTransfer).not.toHaveBeenCalled();
    expect(broadcast).not.toHaveBeenCalled();
  });

  it('keeps native TON in nanotons independently of token metadata', async () => {
    const { broadcast, createTransfer, recipient, send } = setup(6, false);
    await send('0.123456789');
    const message = createTransfer.mock.calls[0][0].messages[0];
    if (message.info.type !== 'internal') throw new Error('Expected an internal transfer');
    expect(message.info.dest.toRawString()).toBe(recipient.toRawString());
    expect(message.info.value.coins).toBe(123_456_789n);
    expect(message.info.bounce).toBe(false);
    expect(broadcast).toHaveBeenCalledOnce();
  });

  it('checks a jetton send against the TON it gives the jetton wallet as well as the fees', () => {
    expect(maxTonTransferFee({ walletAddress: new Address(0, Buffer.alloc(32, 3)) } as never)).toBe('0.07');
    expect(maxTonTransferFee({} as never)).toBe('0.02');
    expect(maxTonTransferFee(undefined)).toBe('0.02');
  });
});

describe('TON transfer bounce', () => {
  const recipient = new Address(0, Buffer.alloc(32, 2));

  async function nativeSend(to: string, recipientStatus: string | Error) {
    const { createTransfer, getAccountStatus, send } = setup(9, false, { recipientStatus, to });
    await send('1');
    const message = createTransfer.mock.calls[0][0].messages[0];
    if (message.info.type !== 'internal') throw new Error('Expected an internal transfer');

    return { bounce: message.info.bounce, getAccountStatus };
  }

  // A contract that refuses TON, such as a jetton master, sends it back; it used to keep it.
  it.each([
    ['active', true],
    ['frozen', true],
    ['uninitialized', false],
    ['nonexist', false],
  ])('bounces TON sent to a bounceable address only when the account there is deployed (%s)', async (status, bounce) => {
    expect((await nativeSend(recipient.toString({ bounceable: true }), status)).bounce).toBe(bounce);
  });

  it('never bounces TON sent to a non-bounceable address', async () => {
    const { bounce, getAccountStatus } = await nativeSend(recipient.toString({ bounceable: false }), 'active');

    expect(bounce).toBe(false);
    expect(getAccountStatus).not.toHaveBeenCalled();
  });

  it('treats a raw address as bounceable', async () => {
    expect((await nativeSend(recipient.toRawString(), 'active')).bounce).toBe(true);
  });

  it('bounces as the address asks when the recipient account cannot be read', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect((await nativeSend(recipient.toString({ bounceable: true }), new Error('TI is down'))).bounce).toBe(true);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
