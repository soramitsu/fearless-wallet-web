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

export async function makeTonTransfer(params: TransferParams, state: State): Promise<void> {
  const {
    networkKey,
    from,
    to,
    balance: { walletAddress },
    amount,
  } = params;

  const api = state.getTonApiMap[networkKey.toLowerCase()];

  const { walletContract, cipherSeed } = state.keyringService.tonKeyring.accountSubject.value[from];
  const seed = state.keyringService.tonKeyring.decodeMnemonic(cipherSeed);

  const { secretKey } = await state.keyringService.tonKeyring.mnemonicToKeyPair(seed.split(' '));
  const destinationAddress = Address.parse(to);

  const messageBody = beginCell()
    .storeUint(0x0f8a7ea5, 32) // opcode for jetton transfer
    .storeUint(0, 64) // query id
    .storeCoins(toNano(amount)) // jetton amount, amount * 10^9
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
