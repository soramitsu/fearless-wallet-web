import { captureWalletResetGuard } from '@extension-base/api/walletResetGuard';
import { Address, beginCell, external, internal, storeMessage, toNano, SendMode } from '@ton/core';
import { parseUnits } from 'ethers';
import { type BalanceItem } from '@extension-base/api/evm/types';
import { TonProviderError } from '@extension-base/services/ton-provider';
import type { BasicTxResponse } from '@extension-base/background/types/types';
import type State from '@extension-base/background/handlers/State';
import { TonKeyringError } from '@/util/tonKeyring';

type HandleBasicTx = (data: BasicTxResponse) => void;

interface TransferParams {
  balance: BalanceItem;
  networkKey: string;
  from: string;
  to: string;
  amount: string;
  assetId: string;
  callback?: HandleBasicTx;
}

export const MAX_TON_FEE = '0.02';

export async function makeTonTransfer(params: TransferParams, state: State): Promise<void> {
  const assertCurrent = captureWalletResetGuard(state);
  const {
    networkKey,
    from,
    to,
    balance: { walletAddress, precision },
    amount,
  } = params;

  const provider = state.getTonApiMap[networkKey.toLowerCase()]?.api;

  if (!provider) throw new TonProviderError('ton_broadcast_unavailable', `no TON provider for ${networkKey}`);

  // The wallet state is read from, and the transfer sent through, one provider that proved it serves this network.
  // Without one, nothing is decrypted or signed.
  const broadcaster = await provider.broadcaster();

  assertCurrent();
  const { walletContract, publicKey } = state.keyringService.tonKeyring.accountSubject.value[from];
  if (!walletContract.address.equals(Address.parse(from))) throw new Error('TON account address mismatch');
  // Rejects with ton_seed_needs_previous_password, before the wallet is read or anything is sent, when the phrase
  // does not open with the current master password.
  const seed = await state.keyringService.tonKeyring.decodeMnemonicVerified(from);

  assertCurrent();
  const { secretKey } = await state.keyringService.tonKeyring
    .mnemonicToKeyPair(seed.split(' '), undefined, publicKey)
    .catch((error: unknown) => {
      // The vault only returns phrases that derive this key, so this means the derivation itself changed.
      if (error instanceof TonKeyringError && error.code === 'account_key_mismatch') throw new TonKeyringError('ton_key_mismatch');

      throw error;
    });
  const destinationAddress = Address.parse(to);

  // A jetton amount is in the jetton's own decimals (6 for USDT), not in nanotons.
  const jettonAmount = walletAddress ? parseUnits(amount, jettonDecimals(precision)) : 0n;

  const messageBody = beginCell()
    .storeUint(0x0f8a7ea5, 32) // opcode for jetton transfer
    .storeUint(0, 64) // query id
    .storeCoins(jettonAmount) // jetton amount, amount * 10^decimals
    .storeAddress(destinationAddress)
    .storeAddress(walletContract.address) // response destination
    .storeBit(0) // no custom payload
    .storeCoins(0) // forward amount - if >0, will send notification message
    .storeBit(0) // we store forwardPayload as a reference
    .endCell();

  const internalMessage = walletAddress
    ? internal({
        to: walletAddress!,
        value: toNano(MAX_TON_FEE),
        bounce: false,
        body: messageBody,
      })
    : internal({
        to: destinationAddress,
        value: toNano(amount),
        body: 'ton transfer',
        bounce: false,
      });

  const { seqno, deployed } = await broadcaster.getWalletState(walletContract.address);

  assertCurrent();
  const body = walletContract.createTransfer({
    seqno,
    secretKey: Buffer.from(secretKey),
    messages: [internalMessage],
    sendMode: SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS,
  });

  // A wallet that has only ever received funds is not deployed yet: its first transfer carries its code.
  const externalMessage = external({
    to: walletContract.address,
    init: deployed ? undefined : walletContract.init,
    body,
  });

  const externalMessageCell = beginCell().store(storeMessage(externalMessage)).endCell();

  assertCurrent();
  await broadcaster.sendMessage(externalMessageCell);

  params.callback?.({ status: true });
}

function jettonDecimals(precision: number | undefined): number {
  if (!Number.isInteger(precision) || precision! < 0 || precision! > 255) throw new Error('ton_jetton_decimals_unknown');

  return precision!;
}
