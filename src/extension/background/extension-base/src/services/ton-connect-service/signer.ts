import { Address, SendMode, beginCell, external, internal, storeMessage } from '@ton/core';
import { sign } from '@ton/crypto';
import { captureWalletResetGuard } from '@extension-base/api/walletResetGuard';
import { TonProviderError, type TonDataProvider } from '@extension-base/services/ton-provider';
import type State from '@extension-base/background/handlers/State';
import { isTonMainnet } from '@/helpers';
import { TonKeyringError } from '@/util/tonKeyring';
import {
  rawTonAddress,
  signDataSigningHash,
  tonProofSigningHash,
  walletStateInitBase64,
  type TonConnectSignData,
  type TonConnectTransaction,
} from '@/util/tonConnect/protocol';

/** A TON wallet TON Connect can use: one the TON keyring holds, which Send also signs for. */
export type TonConnectAccount = {
  address: string;
  name: string;
  publicKeyHex: string;
};

export function tonConnectAccounts(state: State): TonConnectAccount[] {
  return Object.values(state.keyringService.tonKeyring.accountSubject.value).map(({ address, name, publicKey }) => ({
    address,
    name: name ?? '',
    publicKeyHex: Buffer.from(publicKey).toString('hex'),
  }));
}

export function findTonConnectAccount(state: State, address: string): TonConnectAccount | undefined {
  return tonConnectAccounts(state).find((account) => account.address === address);
}

/** The `ton_addr` reply for a TON keyring wallet. */
export function tonAddressReply(state: State, address: string) {
  const account = state.keyringService.tonKeyring.accountSubject.value[address];

  if (!account) throw new Error('TON account not found');

  return {
    name: 'ton_addr' as const,
    address: rawTonAddress(account.walletContract.address),
    network: '-239',
    publicKey: Buffer.from(account.publicKey).toString('hex'),
    walletStateInit: walletStateInitBase64(account.walletContract.init),
  };
}

/**
 * Runs `use` with the wallet's secret key and wipes the key after. The phrase opens only with the current master
 * password and must derive the stored public key, so a session cannot sign as another wallet.
 */
async function withTonSecretKey<T>(
  state: State,
  address: string,
  use: (secretKey: Buffer, assertCurrent: () => void) => Promise<T> | T
): Promise<T> {
  const assertCurrent = captureWalletResetGuard(state);
  const account = state.keyringService.tonKeyring.accountSubject.value[address];

  if (!account || !account.walletContract.address.equals(Address.parse(address))) throw new Error('TON account not found');

  const seed = await state.keyringService.tonKeyring.decodeMnemonicVerified(address);

  assertCurrent();

  const { secretKey } = await state.keyringService.tonKeyring
    .mnemonicToKeyPair(seed.split(' '), undefined, account.publicKey)
    .catch((error: unknown) => {
      if (error instanceof TonKeyringError && error.code === 'account_key_mismatch') throw new TonKeyringError('ton_key_mismatch');

      throw error;
    });
  const key = Buffer.from(secretKey);

  try {
    assertCurrent();

    return await use(key, assertCurrent);
  } finally {
    key.fill(0);
    secretKey.fill?.(0);
  }
}

export async function signTonProof(
  state: State,
  input: { address: string; domain: string; timestamp: number; payload: string }
) {
  return withTonSecretKey(state, input.address, (secretKey) => {
    const hash = tonProofSigningHash({
      address: Address.parse(input.address),
      domain: input.domain,
      timestamp: input.timestamp,
      payload: input.payload,
    });

    return {
      name: 'ton_proof' as const,
      proof: {
        timestamp: input.timestamp,
        domain: { lengthBytes: new TextEncoder().encode(input.domain).length, value: input.domain },
        payload: input.payload,
        signature: sign(Buffer.from(hash), secretKey).toString('base64'),
      },
    };
  });
}

export async function signTonData(
  state: State,
  input: { address: string; domain: string; timestamp: number; data: TonConnectSignData }
): Promise<string> {
  return withTonSecretKey(state, input.address, (secretKey) =>
    sign(
      Buffer.from(
        signDataSigningHash({
          address: Address.parse(input.address),
          domain: input.domain,
          timestamp: input.timestamp,
          data: input.data,
        })
      ),
      secretKey
    ).toString('base64')
  );
}

/** The verified TON mainnet provider that reads wallet state and accepts transactions. */
export async function tonMainnetBroadcaster(state: State): Promise<TonDataProvider> {
  const network = state.networkService.networkValues.find(({ name }) => isTonMainnet(name));

  if (!network) throw new TonProviderError('ton_broadcast_unavailable', 'TON mainnet is not in the network list');

  const key = network.name.toLowerCase();

  if (!state.getTonApiMap[key]) await state.networkService.tonApiHandler.initApi(network);

  const router = state.getTonApiMap[key]?.api;

  if (!router) throw new TonProviderError('ton_broadcast_unavailable', 'no TON mainnet provider');

  return router.broadcaster();
}

/**
 * Signs the reviewed messages with send mode 3 (pay fees separately, ignore errors), as TON Connect specifies, and
 * sends them. The wallet message expires at the request's `valid_until`, so a message held back by the network can
 * never land later than the dApp allowed. `beforeSend` runs right before the message leaves: from then on a cancel
 * cannot stop it. Returns the base64 BoC of the external message, which TON Connect hands back to the dApp.
 */
export async function sendTonConnectTransaction(
  state: State,
  address: string,
  transaction: TonConnectTransaction,
  beforeSend: () => void,
  now: () => number = () => Math.floor(Date.now() / 1000)
): Promise<string> {
  const broadcaster = await tonMainnetBroadcaster(state);
  const account = state.keyringService.tonKeyring.accountSubject.value[address];

  if (!account) throw new Error('TON account not found');

  const { walletContract } = account;
  const { seqno, deployed } = await broadcaster.getWalletState(walletContract.address);

  return withTonSecretKey(state, address, async (secretKey, assertCurrent) => {
    const timeout = transaction.validUntil ?? now() + 5 * 60;

    if (timeout <= now()) throw new Error('The request has expired');

    const body = walletContract.createTransfer({
      seqno,
      secretKey,
      timeout,
      sendMode: SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS,
      messages: transaction.messages.map((message) =>
        internal({
          to: message.destination,
          value: message.amount,
          bounce: message.bounce,
          body: message.payload,
          init: message.stateInit,
        })
      ),
    });
    const externalMessage = beginCell()
      .store(
        storeMessage(
          external({
            to: walletContract.address,
            init: deployed ? undefined : walletContract.init,
            body,
          })
        )
      )
      .endCell();

    assertCurrent();
    beforeSend();
    await broadcaster.sendMessage(externalMessage);

    return externalMessage.toBoc().toString('base64');
  });
}
