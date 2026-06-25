import { WalletEcosystem } from '@/interfaces';
import {
  validateUniversalWalletSigningRequest,
  validateUniversalWalletSigningResult,
  type UniversalWalletSigningRequest,
  type UniversalWalletSigningResult,
} from '@/util/universalWalletSigningContract';

describe('Universal Wallet signing contract', () => {
  it('validates and serializes message signing requests and results', () => {
    const request = messageRequest();
    const result = approvedMessageResult();

    expect(validateUniversalWalletSigningRequest(request)).toEqual([]);
    expect(validateUniversalWalletSigningResult(result)).toEqual([]);
    expect(JSON.stringify(request)).toContain('"method":"sign-message"');
    expect(JSON.stringify(request)).toContain('"encoding":"base64"');
    expect(JSON.stringify(result)).toContain('"status":"approved"');
    expect(JSON.stringify(result)).toContain(`"signatureHex":"${'ab'.repeat(64)}"`);
  });

  it('rejects malformed message signing requests', () => {
    const errors = validateUniversalWalletSigningRequest({
      ...messageRequest(),
      requestId: 'bad',
      accountId: '../bad',
      ecosystem: 'unknown' as WalletEcosystem,
      chainId: 'bad chain',
      origin: ' https://dapp.example ',
      message: {
        display: 'utf8',
        encoding: 'base64',
        value: '*not-base64*',
      },
      transactionBase64: 'AQID',
      createdAtMillis: 10,
      expiresAtMillis: 9,
    });

    expect(errors).toEqual(
      expect.arrayContaining([
        'invalidRequestId',
        'invalidAccountId',
        'invalidEcosystem',
        'invalidChainId',
        'invalidOrigin',
        'invalidBase64',
        'payloadNotAllowed',
        'invalidTimestamp',
      ])
    );
  });

  it('validates transaction and batch signing requests', () => {
    const transaction = {
      ...messageRequest(),
      message: undefined,
      method: 'sign-transaction' as const,
      transactionBase64: 'AQIDBA==',
    };
    const signAndSend = { ...transaction, method: 'sign-and-send-transaction' as const };
    const batch = {
      ...transaction,
      method: 'sign-all-transactions' as const,
      transactionBase64: undefined,
      transactionsBase64: ['AQIDBA==', 'BQYHCA=='],
    };

    expect(validateUniversalWalletSigningRequest(transaction)).toEqual([]);
    expect(validateUniversalWalletSigningRequest(signAndSend)).toEqual([]);
    expect(validateUniversalWalletSigningRequest(batch)).toEqual([]);
  });

  it('rejects malformed transaction and batch signing requests', () => {
    const transaction = {
      ...messageRequest(),
      message: undefined,
      method: 'sign-transaction' as const,
      transactionBase64: '*bad*',
    };
    const batch = {
      ...transaction,
      method: 'sign-all-transactions' as const,
      transactionBase64: undefined,
      transactionsBase64: Array.from({ length: 17 }, () => 'AQIDBA=='),
    };

    expect(validateUniversalWalletSigningRequest(transaction)).toContain('transactionRequired');
    expect(validateUniversalWalletSigningRequest(batch)).toContain('invalidBatch');
  });

  it('validates approved transaction and rejected signing results', () => {
    const transaction: UniversalWalletSigningResult = {
      ...approvedMessageResult(),
      method: 'sign-and-send-transaction',
      signatureHex: undefined,
      signedTransactionBase64: 'AQIDBA==',
      transactionHash: '5NfHnqDyzT9qyfxZDq2sSskAMGuFZ3VRqW4EQxghKqrKYdKq6cZNW1J34w7qE6nGx1eDQe5s2eKxB2ZtE1xU9qgN',
    };
    const rejected: UniversalWalletSigningResult = {
      ...approvedMessageResult(),
      errorCode: 'user_rejected',
      publicKey: undefined,
      signatureHex: undefined,
      status: 'rejected',
    };

    expect(validateUniversalWalletSigningResult(transaction)).toEqual([]);
    expect(validateUniversalWalletSigningResult(rejected)).toEqual([]);
  });

  it('rejects inconsistent signing results', () => {
    const approved = {
      ...approvedMessageResult(),
      errorCode: 'not_allowed',
      publicKey: undefined,
      signatureHex: 'ABC',
    };
    const failed = {
      ...approvedMessageResult(),
      errorCode: undefined,
      status: 'failed' as const,
    };

    expect(validateUniversalWalletSigningResult(approved)).toEqual(
      expect.arrayContaining(['publicKeyRequired', 'invalidSignature', 'errorNotAllowed'])
    );
    expect(validateUniversalWalletSigningResult(failed)).toEqual(
      expect.arrayContaining(['errorCodeRequired', 'signatureNotAllowed'])
    );
  });
});

function messageRequest(): UniversalWalletSigningRequest {
  return {
    requestId: 'sign_1234567890abcdef',
    accountId: 'solana-mainnet',
    ecosystem: WalletEcosystem.Solana,
    chainId: 'solana:mainnet',
    origin: 'https://dapp.example',
    method: 'sign-message',
    message: {
      display: 'utf8',
      encoding: 'base64',
      value: 'ZmVhcmxlc3M=',
    },
    createdAtMillis: 1_710_000_000_000,
    expiresAtMillis: 1_710_000_060_000,
  };
}

function approvedMessageResult(): UniversalWalletSigningResult {
  return {
    requestId: 'sign_1234567890abcdef',
    accountId: 'solana-mainnet',
    ecosystem: WalletEcosystem.Solana,
    chainId: 'solana:mainnet',
    method: 'sign-message',
    status: 'approved',
    publicKey: 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk',
    signatureHex: 'ab'.repeat(64),
    signedAtMillis: 1_710_000_000_100,
  };
}
