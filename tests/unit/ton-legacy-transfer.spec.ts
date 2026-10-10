import { Address, fromNano, loadMessage, loadMessageRelaxed, type Cell } from '@ton/core';
import { signVerify } from '@ton/crypto';
import CryptoJS from 'crypto-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeTonTransfer } from '@extension-base/api/ton/transfer';
import { TonKeyringService } from '@extension-base/services/keyring-service/TonKeyring';
import legacyVectors from '../fixtures/ton/ton-bip39-3.0.5-vectors.json';
import type { BalanceItem } from '@extension-base/api/evm/types';
import type State from '@extension-base/background/handlers/State';
import type { TonStoreAccount } from '@extension-base/stores/TonStore';

const mocks = vi.hoisted(() => ({ records: [] as TonStoreAccount[] }));
// Like chrome.storage, the stored TON records arrive after the keyring service is constructed.
vi.mock('@extension-base/stores/TonStore', () => ({
  tonStore: {
    all: (callback: (address: string, record: TonStoreAccount) => void) =>
      Promise.resolve().then(() => mocks.records.forEach((record) => callback(record.address, record))),
    set: vi.fn(),
    remove: vi.fn(),
    updateAndWait: vi.fn(),
  },
}));

const MASTER_PASSWORD = '3.0.5 master password fixture';
const NETWORK_KEY = 'TON Mainnet';
const [account, recipient] = legacyVectors.vectors;

// The record shape 3.0.1-3.0.5 TonKeyring.createAccount wrote: no meta, phrase encrypted with the master password.
function legacyRecord(
  vector: (typeof legacyVectors.vectors)[number],
  phrase = vector.mnemonic,
  password = MASTER_PASSWORD
): TonStoreAccount {
  return {
    name: 'TON from BIP39',
    address: vector.address,
    cipherSeed: CryptoJS.AES.encrypt(phrase, password).toString(),
    publicKeyHex: vector.publicKeyHex,
  };
}

async function upgradedState() {
  const sendBlockchainMessage = vi.fn();
  const getAccountSeqno = vi.fn().mockResolvedValue({ seqno: 7 });
  const keyringService = { getPassword: () => MASTER_PASSWORD } as { getPassword: () => string; tonKeyring: TonKeyringService };
  keyringService.tonKeyring = new TonKeyringService(keyringService as never);
  await vi.waitFor(() => expect(Object.keys(keyringService.tonKeyring.accountSubject.value)).toHaveLength(mocks.records.length));

  const state = {
    getTonApiMap: {
      [NETWORK_KEY.toLowerCase()]: {
        api: {
          wallet: { getAccountSeqno },
          blockchain: { sendBlockchainMessage },
        },
      },
    },
    keyringService,
  } as unknown as State;

  return { getAccountSeqno, sendBlockchainMessage, state };
}

function transfer(state: State, amount = '0.5') {
  return makeTonTransfer(
    {
      balance: { walletAddress: undefined } as unknown as BalanceItem,
      networkKey: NETWORK_KEY,
      from: account.address,
      to: recipient.address,
      amount,
      assetId: 'ton',
    },
    state
  );
}

beforeEach(() => {
  mocks.records = [];
});

describe('TON accounts imported from BIP39 phrases in 3.0.x', () => {
  it('sign transfers with the stored key after the upgrade', async () => {
    mocks.records = [legacyRecord(account)];
    const { sendBlockchainMessage, state } = await upgradedState();

    await transfer(state);

    expect(sendBlockchainMessage).toHaveBeenCalledOnce();
    const [{ boc }] = sendBlockchainMessage.mock.calls[0] as [{ boc: Cell }];
    const message = loadMessage(boc.beginParse());
    expect(message.info.type).toBe('external-in');
    expect((message.info.dest as Address).equals(Address.parse(account.address))).toBe(true);

    const body = message.body.beginParse();
    const signature = body.loadBuffer(64);
    const signed = body.asCell();
    expect(signVerify(signed.hash(), signature, Buffer.from(account.publicKeyHex, 'hex'))).toBe(true);

    const walletId = body.loadUint(32);
    body.skip(32); // valid_until
    expect({ walletId, seqno: body.loadUint(32), op: body.loadUint(8) }).toEqual({ walletId: 698983191, seqno: 7, op: 0 });
    body.skip(8); // send mode
    const internal = loadMessageRelaxed(body.loadRef().beginParse());
    expect(internal.info.type).toBe('internal');
    if (internal.info.type !== 'internal') return;
    expect(internal.info.dest.equals(Address.parse(recipient.address))).toBe(true);
    expect(fromNano(internal.info.value.coins)).toBe('0.5');
  });

  it('refuse to sign when the stored phrase does not derive the stored key', async () => {
    mocks.records = [legacyRecord(account, recipient.mnemonic)];
    const { getAccountSeqno, sendBlockchainMessage, state } = await upgradedState();

    // Indistinguishable from a phrase encrypted with another password: it goes to Account access.
    await expect(transfer(state)).rejects.toMatchObject({ code: 'ton_seed_needs_previous_password' });
    expect(getAccountSeqno).not.toHaveBeenCalled();
    expect(sendBlockchainMessage).not.toHaveBeenCalled();
  });

  // 3.0.5 changed the master password without re-encrypting TON phrases (W3).
  it('reject before any network call when the phrase opens only with a previous password', async () => {
    mocks.records = [legacyRecord(account, account.mnemonic, 'password used before the 3.0.5 change')];
    const { getAccountSeqno, sendBlockchainMessage, state } = await upgradedState();

    await expect(transfer(state)).rejects.toMatchObject({ code: 'ton_seed_needs_previous_password' });
    expect(state.keyringService.tonKeyring.vault.needsPreviousPassword.has(account.address)).toBe(true);
    expect(getAccountSeqno).not.toHaveBeenCalled();
    expect(sendBlockchainMessage).not.toHaveBeenCalled();
  });
});
