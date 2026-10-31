import { Address, Cell, fromNano, loadMessage, loadMessageRelaxed } from '@ton/core';
import { signVerify } from '@ton/crypto';
import CryptoJS from 'crypto-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeTonTransfer } from '@extension-base/api/ton/transfer';
import { TonKeyringService } from '@extension-base/services/keyring-service/TonKeyring';
import { TonProviderRouter, type TonProviderOptions } from '@extension-base/services/ton-provider';
import legacyVectors from '../fixtures/ton/ton-bip39-3.0.5-vectors.json';
import registrySnapshot from '../fixtures/legacy-305/chains-v13.snapshot.json';
import tiResponses from '../fixtures/ton/ti-responses-20261011.json';
import type { TonApiClientLike } from '@extension-base/services/ton-provider/RegistryNodeTonProvider';
import type { BalanceItem } from '@extension-base/api/evm/types';
import type State from '@extension-base/background/handlers/State';
import type { NetworkJson } from '@extension-base/types';
import type { TonStoreAccount } from '@extension-base/stores/TonStore';

const mocks = vi.hoisted(() => ({ records: [] as TonStoreAccount[] }));
// Like chrome.storage, the stored TON records arrive after the keyring service is constructed.
vi.mock('@extension-base/stores/TonStore', () => ({
  tonStore: {
    readAll: async () => mocks.records,
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

// TON Mainnet as the shipped registry lists it (tonapi.io), with TI answering as it does today (no service-info),
// so transfers go through the verified registry node.
const tonMainnet = (registrySnapshot as unknown as NetworkJson[]).find(({ name }) => name === NETWORK_KEY)!;
const deployedTi = vi.fn(async () => new Response(JSON.stringify(tiResponses.deployed.serviceInfo.body), { status: 404 }));

async function upgradedState({ status = 'active', globalId = -239, provider = {} as TonProviderOptions } = {}) {
  const sendBlockchainMessage = vi.fn();
  const getAccountSeqno = vi.fn().mockResolvedValue({ seqno: 7 });
  const getAccount = vi.fn().mockResolvedValue({ balance: 2_000_000_000n, status });
  const client = {
    accounts: { getAccount },
    blockchain: { getBlockchainMasterchainHead: vi.fn().mockResolvedValue({ globalId }), sendBlockchainMessage },
    wallet: { getAccountSeqno },
  } as unknown as TonApiClientLike;
  const keyringService = { getPassword: () => MASTER_PASSWORD } as { getPassword: () => string; tonKeyring: TonKeyringService };
  keyringService.tonKeyring = new TonKeyringService(keyringService as never);
  await vi.waitFor(() => expect(Object.keys(keyringService.tonKeyring.accountSubject.value)).toHaveLength(mocks.records.length));
  const decodeMnemonicVerified = vi.spyOn(keyringService.tonKeyring, 'decodeMnemonicVerified');

  const state = {
    getTonApiMap: {
      [NETWORK_KEY.toLowerCase()]: {
        api: new TonProviderRouter(tonMainnet, {
          fetchFn: deployedTi,
          createTonApiClient: () => client,
          logger: { info: vi.fn(), warn: vi.fn() },
          ...provider,
        }),
      },
    },
    keyringService,
  } as unknown as State;

  return { decodeMnemonicVerified, getAccountSeqno, sendBlockchainMessage, state };
}

function transfer(state: State, amount = '0.5', balance = { walletAddress: undefined } as unknown as BalanceItem, callback = vi.fn()) {
  return makeTonTransfer(
    {
      balance,
      networkKey: NETWORK_KEY,
      from: account.address,
      to: recipient.address,
      amount,
      assetId: 'ton',
      callback,
    },
    state
  );
}

function sentMessage(sendBlockchainMessage: ReturnType<typeof vi.fn>) {
  const [{ boc }] = sendBlockchainMessage.mock.calls[0] as [{ boc: Cell }];

  return loadMessage(boc.beginParse());
}

beforeEach(() => {
  mocks.records = [];
});

describe('TON accounts imported from BIP39 phrases in 3.0.x', () => {
  it('sign transfers with the stored key after the upgrade', async () => {
    mocks.records = [legacyRecord(account)];
    const { sendBlockchainMessage, state } = await upgradedState();
    const callback = vi.fn();

    await transfer(state, '0.5', undefined, callback);

    expect(sendBlockchainMessage).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith({ status: true });
    const message = sentMessage(sendBlockchainMessage);
    expect(message.info.type).toBe('external-in');
    // A deployed wallet does not send its code again.
    expect(message.init).toBeFalsy();
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
  it('reject before reading the wallet or sending when the phrase opens only with a previous password', async () => {
    mocks.records = [legacyRecord(account, account.mnemonic, 'password used before the 3.0.5 change')];
    const { getAccountSeqno, sendBlockchainMessage, state } = await upgradedState();

    await expect(transfer(state)).rejects.toMatchObject({ code: 'ton_seed_needs_previous_password' });
    expect(state.keyringService.tonKeyring.vault.needsPreviousPassword.has(account.address)).toBe(true);
    expect(getAccountSeqno).not.toHaveBeenCalled();
    expect(sendBlockchainMessage).not.toHaveBeenCalled();
  });
});

describe('TON transfers through the verified provider', () => {
  it.each([true, false])('does not sign or broadcast after reset during wallet state lookup (still resetting: %s)', async isResetting => {
    mocks.records = [legacyRecord(account)];
    const { getAccountSeqno, sendBlockchainMessage, state } = await upgradedState();
    const sign = vi.spyOn(state.keyringService.tonKeyring.accountSubject.value[account.address].walletContract, 'createTransfer');
    getAccountSeqno.mockImplementation(async () => {
      Object.assign(state.keyringService, { isResetting, walletResetRevision: 1 });
      return { seqno: 7 };
    });
    await expect(transfer(state)).rejects.toThrow('Wallet changed during transfer');
    expect(sign).not.toHaveBeenCalled();
    expect(sendBlockchainMessage).not.toHaveBeenCalled();
  });
  it('send a jetton amount in the jetton\'s own decimals, not in nanotons', async () => {
    mocks.records = [legacyRecord(account)];
    const { sendBlockchainMessage, state } = await upgradedState();
    const jettonWallet = Address.parse(recipient.address);

    await transfer(state, '1.5', { walletAddress: jettonWallet, precision: 6 } as unknown as BalanceItem);

    const message = sentMessage(sendBlockchainMessage);
    const body = message.body.beginParse();
    body.skip(512 + 32 + 32 + 32 + 8 + 8); // signature, wallet id, valid_until, seqno, op, send mode
    const internal = loadMessageRelaxed(body.loadRef().beginParse());
    if (internal.info.type !== 'internal') throw new Error('expected an internal message');
    expect(internal.info.dest.equals(jettonWallet)).toBe(true);
    expect(fromNano(internal.info.value.coins)).toBe('0.05');
    expect(internal.info.bounce).toBe(true);

    const jettonTransfer = internal.body.beginParse();
    expect(jettonTransfer.loadUint(32)).toBe(0x0f8a7ea5);
    jettonTransfer.skip(64); // query id
    // 1.5 USDT is 1,500,000 units; the shipped code wrote 1,500,000,000 (1,500 USDT).
    expect(jettonTransfer.loadCoins()).toBe(1_500_000n);
    expect(jettonTransfer.loadAddress().equals(Address.parse(recipient.address))).toBe(true);
  });

  it('refuse a jetton transfer whose decimals are unknown', async () => {
    mocks.records = [legacyRecord(account)];
    const { sendBlockchainMessage, state } = await upgradedState();

    await expect(
      transfer(state, '1', { walletAddress: Address.parse(recipient.address) } as unknown as BalanceItem)
    ).rejects.toThrow('ton_jetton_decimals_unknown');
    expect(sendBlockchainMessage).not.toHaveBeenCalled();
  });

  it('deploy a wallet that has only received funds with its first transfer', async () => {
    mocks.records = [legacyRecord(account)];
    const { getAccountSeqno, sendBlockchainMessage, state } = await upgradedState({ status: 'uninit' });

    await transfer(state);

    expect(getAccountSeqno).not.toHaveBeenCalled();
    const message = sentMessage(sendBlockchainMessage);
    const { walletContract } = state.keyringService.tonKeyring.accountSubject.value[account.address];
    expect(message.init?.code?.equals(walletContract.init.code)).toBe(true);
    expect(message.init?.data?.equals(walletContract.init.data)).toBe(true);
    const body = message.body.beginParse();
    body.skip(512 + 32 + 32);
    expect(body.loadUint(32)).toBe(0);
  });

  it('decrypt and sign nothing when no provider proves TON mainnet', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mocks.records = [legacyRecord(account)];
    // TI answers as it does today and the registry node serves TON testnet.
    const { decodeMnemonicVerified, getAccountSeqno, sendBlockchainMessage, state } = await upgradedState({ globalId: -3 });

    await expect(transfer(state)).rejects.toMatchObject({ code: 'ton_provider_unavailable' });
    expect(decodeMnemonicVerified).not.toHaveBeenCalled();
    expect(getAccountSeqno).not.toHaveBeenCalled();
    expect(sendBlockchainMessage).not.toHaveBeenCalled();
  });

  it('send through TI once TI proves TON mainnet and accepts transactions', async () => {
    mocks.records = [legacyRecord(account)];
    const statePath = `/api/indexer/v1/accounts/${Address.parse(account.address).toString()}/state`;
    const fetchFn = vi.fn(async (input: string, init?: RequestInit) => {
      const { pathname } = new URL(input);
      const reply = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

      if (pathname === '/api/indexer/v1/service-info') return reply({ ...tiResponses.sourceMainnetServiceInfo, readOnly: false });
      if (pathname === statePath) {
        return reply({ address: account.address, account_state: 'active', network: 'mainnet' });
      }
      if (pathname === '/api/indexer/v1/runGetMethod') return reply({ exit_code: 0, gas_used: 1, stack: [['num', '0x9']] });
      if (pathname === '/api/v2/jsonRPC' && init?.method === 'POST') return reply({ id: 1, jsonrpc: '2.0', ok: true, result: { '@type': 'ok' } });

      return new Response('{}', { status: 404 });
    });
    const { sendBlockchainMessage, state } = await upgradedState({ provider: { fetchFn } });

    await transfer(state);

    expect(sendBlockchainMessage).not.toHaveBeenCalled();
    const { params } = JSON.parse(String(fetchFn.mock.calls.at(-1)![1]!.body)) as { params: { boc: string } };
    const message = loadMessage(Cell.fromBase64(params.boc).beginParse());
    const body = message.body.beginParse();
    const signature = body.loadBuffer(64);
    expect(signVerify(body.asCell().hash(), signature, Buffer.from(account.publicKeyHex, 'hex'))).toBe(true);
    body.skip(32 + 32);
    expect(body.loadUint(32)).toBe(9);
  });
});
