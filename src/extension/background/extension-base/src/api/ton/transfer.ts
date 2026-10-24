import { Address, beginCell, external, internal, storeMessage, toNano, SendMode } from '@ton/core';
import { type BalanceItem } from '@extension-base/api/evm/types';
import type State from '@extension-base/background/handlers/State';

interface TransferParams {
  balance: BalanceItem;
  networkKey: string;
  from: string;
  to: string;
  amount: string;
  assetId: string;
}

export const MAX_TON_FEE = '0.02';

function jettonUnits(amount: string, precision: number): bigint {
  if (!Number.isInteger(precision) || precision < 0 || precision > 255 || !/^\d+(?:\.\d+)?$/.test(amount)) {
    throw new Error('Invalid jetton amount or precision');
  }

  const [whole, fraction = ''] = amount.split('.');
  const significantFraction = fraction.replace(/0+$/, '');
  if (significantFraction.length > precision) throw new Error('Jetton amount exceeds token precision');

  return BigInt(whole) * 10n ** BigInt(precision) + BigInt(significantFraction.padEnd(precision, '0') || '0');
}

export async function makeTonTransfer(params: TransferParams, state: State): Promise<void> {
  const {
    networkKey,
    from,
    to,
    balance: { walletAddress, precision },
    amount,
  } = params;

  const tokenAmount = walletAddress ? jettonUnits(amount, precision) : undefined;
  const api = state.getTonApiMap[networkKey.toLowerCase()];

  const { walletContract, publicKey } = state.keyringService.tonKeyring.accountSubject.value[from];
  if (!walletContract.address.equals(Address.parse(from))) throw new Error('TON account address mismatch');
  const seed = await state.keyringService.tonKeyring.decodeAccountMnemonic(from);

  const { secretKey } = await state.keyringService.tonKeyring.mnemonicToKeyPair(seed.split(' '), undefined, publicKey);
  const destinationAddress = Address.parse(to);

  const messageBody = tokenAmount === undefined ? undefined : beginCell()
    .storeUint(0x0f8a7ea5, 32) // opcode for jetton transfer
    .storeUint(0, 64) // query id
    .storeCoins(tokenAmount)
    .storeAddress(destinationAddress)
    .storeAddress(walletContract.address) // response destination
    .storeBit(0) // no custom payload
    .storeCoins(0) // forward amount - if >0, will send notification message
    .storeBit(0) // we store forwardPayload as a reference
    .endCell();

  // TODO ton add init options for new accounts
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

  const { seqno } = await api.api.wallet.getAccountSeqno(walletContract.address);

  const body = walletContract.createTransfer({
    seqno,
    secretKey: Buffer.from(secretKey),
    messages: [internalMessage],
    sendMode: SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS,
  });

  const externalMessage = external({
    to: walletContract.address,
    body,
  });

  const externalMessageCell = beginCell().store(storeMessage(externalMessage)).endCell();

  await api.api.blockchain.sendBlockchainMessage({ boc: externalMessageCell });

  return;
}
