import SolanaRequestHandler from '@extension-base/services/request-service/handlers/SolanaRequestHandler';
import { base58Decode } from '@polkadot/util-crypto';
import vectors from '../../docs/universal-wallet-v2-vectors.json';
import type { RequestService } from '@extension-base/services/request-service';
import type { SolanaSignMessageResponse } from '@extension-base/page/types';
import type { SolanaSimulationResponse } from '@extension-base/services/solana-rpc-service';
import { getSolanaSerializedMessageBase64 } from '@/util/solanaTransaction';

const expectedSolana = vectors.vectors[0].expected.solana;
const SYSTEM_PROGRAM = '11111111111111111111111111111111';
const account = {
  address: 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk',
  name: 'Universal',
  publicKey: 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk',
};

const response: SolanaSignMessageResponse = {
  publicKey: account.publicKey,
  signatureBase58: '5wYdgrn7fYrqx1zLqYkMF5fhkMTL8pWfTgtmbuS4PV7b',
  signatureBase64: 'AQIDBA==',
};

describe('SolanaRequestHandler', () => {
  const createHandler = () => {
    const requestService = {
      popupOpen: vi.fn(),
      updateIcon: vi.fn(),
    } as unknown as RequestService;

    return {
      handler: new SolanaRequestHandler(requestService),
      requestService,
    };
  };

  it('publishes Solana message signing requests and clears them after approval', async () => {
    const { handler, requestService } = createHandler();
    const signing = handler.confirmSignMessage(
      'https://dapp.example',
      {
        display: 'utf8',
        messageBase64: 'ZmVhcmxlc3M=',
        origin: 'dApp',
      },
      account,
      'solana-request-1'
    );

    expect(requestService.popupOpen).toHaveBeenCalledOnce();
    expect(requestService.updateIcon).toHaveBeenCalledWith(undefined);
    expect(handler.signSolanaSubject.value).toEqual({
      'solana-request-1': {
        account,
        display: 'utf8',
        ecosystem: 'solana',
        id: 'solana-request-1',
        messageBase64: 'ZmVhcmxlc3M=',
        method: 'signMessage',
        origin: 'dApp',
        url: 'https://dapp.example',
      },
    });

    handler.getSolanaSignRequest('solana-request-1')?.resolve(response);

    await expect(signing).resolves.toEqual(response);
    expect(handler.signSolanaSubject.value).toEqual({});
    expect(requestService.updateIcon).toHaveBeenLastCalledWith(true);
  });

  it('publishes Solana transaction and batch signing requests', async () => {
    const { handler, requestService } = createHandler();
    const transaction = handler.confirmSignTransaction(
      'https://dapp.example',
      {
        origin: 'dApp',
        transactionBase64: 'AQIDBA==',
      },
      account,
      'solana-tx-1'
    );

    expect(handler.signSolanaSubject.value['solana-tx-1']).toMatchObject({
      method: 'signTransaction',
      transactionBase64: 'AQIDBA==',
      transactionPreview: {
        parseError: 'truncated_signatures',
        transactionBytes: 4,
      },
    });

    handler.getSolanaSignRequest('solana-tx-1')?.resolve({
      publicKey: account.publicKey,
      signatureBase58: response.signatureBase58,
      signedTransactionBase64: 'CQgH',
    });
    await expect(transaction).resolves.toMatchObject({ signedTransactionBase64: 'CQgH' });

    const batch = handler.confirmSignAllTransactions(
      'https://dapp.example',
      {
        origin: 'dApp',
        transactionsBase64: ['BQ==', 'Bg=='],
      },
      account,
      'solana-batch-1'
    );

    expect(requestService.popupOpen).toHaveBeenCalledTimes(2);
    expect(handler.signSolanaSubject.value['solana-batch-1']).toMatchObject({
      method: 'signAllTransactions',
      transactionPreviews: [
        {
          parseError: 'truncated_signatures',
          transactionBytes: 1,
        },
        {
          parseError: 'truncated_signatures',
          transactionBytes: 1,
        },
      ],
      transactionsBase64: ['BQ==', 'Bg=='],
    });

    handler.getSolanaSignRequest('solana-batch-1')?.resolve({
      publicKey: account.publicKey,
      signedTransactionsBase64: ['Bw==', 'CA=='],
      signaturesBase58: ['sig-a', 'sig-b'],
    });
    await expect(batch).resolves.toMatchObject({ signedTransactionsBase64: ['Bw==', 'CA=='] });
  });

  it('publishes Solana sign-and-send requests with validated broadcast options', async () => {
    const { handler, requestService } = createHandler();
    const signing = handler.confirmSignAndSendTransaction(
      'https://dapp.example',
      {
        options: {
          maxRetries: 3,
          preflightCommitment: 'finalized',
          skipPreflight: true,
        },
        origin: 'dApp',
        transactionBase64: 'AQIDBA==',
      },
      account,
      'solana-send-1'
    );

    expect(requestService.popupOpen).toHaveBeenCalledOnce();
    expect(handler.signSolanaSubject.value['solana-send-1']).toMatchObject({
      method: 'signAndSendTransaction',
      options: {
        maxRetries: 3,
        preflightCommitment: 'finalized',
        skipPreflight: true,
      },
      transactionPreview: {
        parseError: 'truncated_signatures',
        transactionBytes: 4,
      },
      transactionBase64: 'AQIDBA==',
    });

    handler.getSolanaSignRequest('solana-send-1')?.resolve({
      publicKey: account.publicKey,
      signature: '5NfHnqDyzT9qyfxZDq2sSskAMGuFZ3VRqW4EQxghKqrKYdKq6cZNW1J34w7qE6nGx1eDQe5s2eKxB2ZtE1xU9qgN',
      signatureBase58: response.signatureBase58,
      signedTransactionBase64: 'CQgH',
    });

    await expect(signing).resolves.toMatchObject({
      signature: '5NfHnqDyzT9qyfxZDq2sSskAMGuFZ3VRqW4EQxghKqrKYdKq6cZNW1J34w7qE6nGx1eDQe5s2eKxB2ZtE1xU9qgN',
      signedTransactionBase64: 'CQgH',
    });
  });

  it('adds semantic previews for valid Solana transaction envelopes', async () => {
    const { handler } = createHandler();
    const transactionBase64 = validTransactionBase64();
    const signing = handler.confirmSignTransaction(
      'https://dapp.example',
      {
        origin: 'dApp',
        transactionBase64,
      },
      account,
      'solana-valid-tx-1'
    );

    expect(handler.signSolanaSubject.value['solana-valid-tx-1']).toMatchObject({
      transactionPreview: {
        accountCount: 2,
        addressTableLookupCount: 0,
        firstSigner: expectedSolana.address,
        instructionCount: 1,
        readonlySignedAccounts: 0,
        readonlyUnsignedAccounts: 1,
        requiredSignatures: 1,
        signatureCount: 1,
        version: 'legacy',
      },
    });

    handler.getSolanaSignRequest('solana-valid-tx-1')?.resolve({
      publicKey: account.publicKey,
      signatureBase58: response.signatureBase58,
      signedTransactionBase64: transactionBase64,
    });

    await expect(signing).resolves.toMatchObject({ signedTransactionBase64: transactionBase64 });
  });

  it('updates sign-and-send requests with Solana RPC simulation success and failure previews', async () => {
    const { handler } = createHandler();
    const successfulSimulation = vi.fn(async () => simulationResponse(null));
    const success = handler.confirmSignAndSendTransaction(
      'https://dapp.example',
      { origin: 'dApp', transactionBase64: 'AQIDBA==' },
      account,
      'solana-send-success',
      successfulSimulation
    );

    expect(handler.signSolanaSubject.value['solana-send-success']).toMatchObject({
      simulation: { status: 'pending' },
    });
    await vi.waitFor(() =>
      expect(handler.signSolanaSubject.value['solana-send-success'].simulation).toMatchObject({
        logCount: 2,
        slot: 123,
        status: 'success',
        unitsConsumed: 5_000,
      })
    );
    expect(successfulSimulation).toHaveBeenCalledWith('AQIDBA==');

    handler.getSolanaSignRequest('solana-send-success')?.resolve({
      publicKey: account.publicKey,
      signature: response.signatureBase58,
      signatureBase58: response.signatureBase58,
      signedTransactionBase64: 'AQIDBA==',
    });
    await expect(success).resolves.toMatchObject({ signature: response.signatureBase58 });

    const failedSimulation = vi.fn(async () => simulationResponse({ InstructionError: [0, 'Custom'] }));
    const failed = handler.confirmSignAndSendTransaction(
      'https://dapp.example',
      { origin: 'dApp', transactionBase64: 'AQIDBA==' },
      account,
      'solana-send-failed',
      failedSimulation
    );

    await vi.waitFor(() =>
      expect(handler.signSolanaSubject.value['solana-send-failed'].simulation).toMatchObject({
        error: '{"InstructionError":[0,"Custom"]}',
        status: 'failed',
      })
    );

    handler.getSolanaSignRequest('solana-send-failed')?.resolve({
      publicKey: account.publicKey,
      signature: response.signatureBase58,
      signatureBase58: response.signatureBase58,
      signedTransactionBase64: 'AQIDBA==',
    });
    await expect(failed).resolves.toMatchObject({ signature: response.signatureBase58 });
  });

  it('updates sign-and-send requests with stable Solana RPC simulation error previews', async () => {
    const { handler } = createHandler();
    const rpcError = handler.confirmSignAndSendTransaction(
      'https://dapp.example',
      { origin: 'dApp', transactionBase64: 'AQIDBA==' },
      account,
      'solana-send-rpc-error',
      vi.fn(async () => {
        throw new Error('rpc down');
      })
    );

    await vi.waitFor(() =>
      expect(handler.signSolanaSubject.value['solana-send-rpc-error'].simulation).toMatchObject({
        error: 'rpc down',
        status: 'error',
      })
    );

    handler.getSolanaSignRequest('solana-send-rpc-error')?.resolve({
      publicKey: account.publicKey,
      signature: response.signatureBase58,
      signatureBase58: response.signatureBase58,
      signedTransactionBase64: 'AQIDBA==',
    });
    await expect(rpcError).resolves.toMatchObject({ signature: response.signatureBase58 });

    const malformed = handler.confirmSignAndSendTransaction(
      'https://dapp.example',
      { origin: 'dApp', transactionBase64: 'AQIDBA==' },
      account,
      'solana-send-malformed',
      vi.fn(async () => ({ malformed: true }) as unknown as SolanaSimulationResponse)
    );

    await vi.waitFor(() =>
      expect(handler.signSolanaSubject.value['solana-send-malformed'].simulation).toMatchObject({
        error: 'invalid_simulation_response',
        status: 'error',
      })
    );

    handler.getSolanaSignRequest('solana-send-malformed')?.resolve({
      publicKey: account.publicKey,
      signature: response.signatureBase58,
      signatureBase58: response.signatureBase58,
      signedTransactionBase64: 'AQIDBA==',
    });
    await expect(malformed).resolves.toMatchObject({ signature: response.signatureBase58 });
  });

  it('updates sign-and-send requests with Solana RPC fee previews from serialized message bytes', async () => {
    const { handler } = createHandler();
    const transactionBase64 = validTransactionBase64();
    const estimateFee = vi.fn(async () => ({
      context: {
        slot: 456,
      },
      value: 5_000,
    }));
    const signing = handler.confirmSignAndSendTransaction(
      'https://dapp.example',
      { origin: 'dApp', transactionBase64 },
      account,
      'solana-send-fee',
      undefined,
      estimateFee
    );

    expect(handler.signSolanaSubject.value['solana-send-fee']).toMatchObject({
      fee: { status: 'pending' },
    });
    await vi.waitFor(() =>
      expect(handler.signSolanaSubject.value['solana-send-fee'].fee).toMatchObject({
        lamports: 5_000,
        slot: 456,
        status: 'ready',
      })
    );
    expect(estimateFee).toHaveBeenCalledWith(getSolanaSerializedMessageBase64(transactionBase64));

    handler.getSolanaSignRequest('solana-send-fee')?.resolve({
      publicKey: account.publicKey,
      signature: response.signatureBase58,
      signatureBase58: response.signatureBase58,
      signedTransactionBase64: transactionBase64,
    });
    await expect(signing).resolves.toMatchObject({ signature: response.signatureBase58 });
  });

  it('handles unavailable fee estimates and malformed fee inputs without calling RPC', async () => {
    const { handler } = createHandler();
    const transactionBase64 = validTransactionBase64();
    const unavailableFee = handler.confirmSignAndSendTransaction(
      'https://dapp.example',
      { origin: 'dApp', transactionBase64 },
      account,
      'solana-send-fee-unavailable',
      undefined,
      vi.fn(async () => ({
        context: {
          slot: 789,
        },
        value: null,
      }))
    );

    await vi.waitFor(() =>
      expect(handler.signSolanaSubject.value['solana-send-fee-unavailable'].fee).toMatchObject({
        slot: 789,
        status: 'unavailable',
      })
    );
    handler.getSolanaSignRequest('solana-send-fee-unavailable')?.resolve({
      publicKey: account.publicKey,
      signature: response.signatureBase58,
      signatureBase58: response.signatureBase58,
      signedTransactionBase64: transactionBase64,
    });
    await expect(unavailableFee).resolves.toMatchObject({ signature: response.signatureBase58 });

    const estimateMalformed = vi.fn(async () => ({
      context: {
        slot: 1,
      },
      value: 1,
    }));
    const malformed = handler.confirmSignAndSendTransaction(
      'https://dapp.example',
      { origin: 'dApp', transactionBase64: 'AQIDBA==' },
      account,
      'solana-send-fee-malformed',
      undefined,
      estimateMalformed
    );

    await vi.waitFor(() =>
      expect(handler.signSolanaSubject.value['solana-send-fee-malformed'].fee).toMatchObject({
        error: 'truncated_signatures',
        status: 'error',
      })
    );
    expect(estimateMalformed).not.toHaveBeenCalled();
    handler.getSolanaSignRequest('solana-send-fee-malformed')?.resolve({
      publicKey: account.publicKey,
      signature: response.signatureBase58,
      signatureBase58: response.signatureBase58,
      signedTransactionBase64: 'AQIDBA==',
    });
    await expect(malformed).resolves.toMatchObject({ signature: response.signatureBase58 });
  });

  it('rejects malformed Solana signing requests before opening the popup', () => {
    const { handler, requestService } = createHandler();

    expect(() =>
      handler.confirmSignMessage('https://dapp.example', { messageBase64: '*not-base64*', origin: 'dApp' }, account)
    ).toThrow('Invalid Solana message payload');
    expect(() =>
      handler.confirmSignMessage(
        'https://dapp.example',
        { display: 'binary' as 'utf8', messageBase64: 'ZmVhcmxlc3M=', origin: 'dApp' },
        account
      )
    ).toThrow('Invalid Solana message display mode');
    expect(() =>
      handler.confirmSignMessage('https://dapp.example', { messageBase64: 'ZmVhcmxlc3M=', origin: '' }, account)
    ).toThrow('Invalid Solana request origin');
    expect(() =>
      handler.confirmSignMessage('https://dapp.example', { messageBase64: 'A'.repeat(87388), origin: 'dApp' }, account)
    ).toThrow('Solana message payload is too large');
    expect(() =>
      handler.confirmSignTransaction('https://dapp.example', { transactionBase64: '*not-base64*', origin: 'dApp' }, account)
    ).toThrow('Invalid Solana transaction payload');
    expect(() =>
      handler.confirmSignAndSendTransaction(
        'https://dapp.example',
        { options: { maxRetries: 11 }, transactionBase64: 'AQIDBA==', origin: 'dApp' },
        account
      )
    ).toThrow('Invalid Solana max retries');
    expect(() =>
      handler.confirmSignAndSendTransaction(
        'https://dapp.example',
        {
          options: { preflightCommitment: 'singleGossip' as 'confirmed' },
          transactionBase64: 'AQIDBA==',
          origin: 'dApp',
        },
        account
      )
    ).toThrow('Invalid Solana preflight commitment');
    expect(() =>
      handler.confirmSignAndSendTransaction(
        'https://dapp.example',
        { options: { skipPreflight: 'yes' as unknown as boolean }, transactionBase64: 'AQIDBA==', origin: 'dApp' },
        account
      )
    ).toThrow('Invalid Solana skipPreflight option');
    expect(() =>
      handler.confirmSignAllTransactions('https://dapp.example', { transactionsBase64: [], origin: 'dApp' }, account)
    ).toThrow('Invalid Solana transaction batch');
    expect(() =>
      handler.confirmSignAllTransactions(
        'https://dapp.example',
        { transactionsBase64: new Array(17).fill('AQ=='), origin: 'dApp' },
        account
      )
    ).toThrow('Solana transaction batch is too large');
    expect(requestService.popupOpen).not.toHaveBeenCalled();
    expect(handler.signSolanaSubject.value).toEqual({});
  });
});

function compact(value: number): number[] {
  const result: number[] = [];
  let next = value;

  do {
    let byte = next & 0x7f;

    next >>= 7;
    if (next > 0) byte |= 0x80;
    result.push(byte);
  } while (next > 0);

  return result;
}

function bytes(...chunks: Array<number[] | Uint8Array>): Uint8Array {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

function key(address: string): Uint8Array {
  return base58Decode(address);
}

function validTransactionBase64(): string {
  const message = bytes(
    [1, 0, 1],
    compact(2),
    key(expectedSolana.address),
    key(SYSTEM_PROGRAM),
    new Uint8Array(32).fill(9),
    compact(1),
    [1],
    compact(1),
    [0],
    compact(0)
  );
  const transaction = bytes(compact(1), new Uint8Array(64), message);

  return Buffer.from(transaction).toString('base64');
}

function simulationResponse(err: unknown): SolanaSimulationResponse {
  return {
    context: {
      slot: 123,
    },
    value: {
      err,
      logs: ['Program log: ok', 'Program complete'],
      unitsConsumed: 5_000,
    },
  };
}
