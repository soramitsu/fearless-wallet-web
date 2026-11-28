import { describe, expect, it } from 'vitest';
import type { TonRequestPayload } from '@extension-base/services/request-service/types';
import { signingRequestKind, signingReview } from '@/screens/extension-ui/signing/review';

const base: TonRequestPayload = {
  account: { address: 'EQ-sender', name: 'TON one', publicKey: 'ab'.repeat(32) },
  appName: 'Example dApp',
  ecosystem: 'ton',
  id: 'ton.1',
  method: 'sendTransaction',
  url: 'https://app.example',
  origin: 'https://app.example',
};

describe('TON Connect review', () => {
  it('belongs to the TON queue', () => {
    expect(signingRequestKind(base)).toBe('ton');
    expect(signingReview({ ...base, messages: [] }).protocol).toBe('TON');
  });

  it('shows plain transfers and comments in full', () => {
    const review = signingReview({
      ...base,
      messages: [
        { to: 'UQ-recipient', bounce: false, amount: '1500000000', kind: 'comment', comment: 'gm', deploysContract: false },
        { to: 'EQ-other', bounce: true, amount: '1', kind: 'transfer', deploysContract: false },
      ],
    });

    expect(review).toMatchObject({ network: 'TON Mainnet', networkIdentity: '-239', feeKind: 'unavailable', blind: false, blocked: false });
    expect(review.actions).toEqual([
      { kind: 'transfer', from: 'EQ-sender', to: 'UQ-recipient', amount: '1.5 TON', text: undefined },
      { kind: 'message', text: 'gm' },
      { kind: 'transfer', from: 'EQ-sender', to: 'EQ-other', amount: '0.000000001 TON', text: undefined },
    ]);
  });

  it('asks for the raw data on contract calls, jetton transfers and deployments', () => {
    const jetton = signingReview({
      ...base,
      messages: [
        {
          to: 'EQ-jetton-wallet',
          bounce: true,
          amount: '50000000',
          kind: 'jettonTransfer',
          deploysContract: false,
          jetton: { amount: '1000000', destination: 'EQ-recipient', forwardTon: '1', forwardComment: 'swap' },
        },
      ],
    });

    expect(jetton.blind).toBe(true);
    expect(jetton.actions).toEqual([
      { kind: 'transfer', from: 'EQ-sender', to: 'EQ-recipient', amount: '1000000', asset: 'EQ-jetton-wallet' },
      { kind: 'transfer', from: 'EQ-sender', to: 'EQ-jetton-wallet', amount: '0.05 TON' },
      { kind: 'message', text: 'swap' },
    ]);

    const unknown = signingReview({
      ...base,
      messages: [{ to: 'EQ-dex', bounce: true, amount: '2', kind: 'unknown', opcode: '0x25938561', deploysContract: true }],
    });

    expect(unknown.blind).toBe(true);
    expect(unknown.actions).toEqual([
      { kind: 'unknown', from: 'EQ-sender', to: 'EQ-dex', amount: '0.000000002 TON', text: 'op 0x25938561' },
      { kind: 'unknown', to: 'EQ-dex' },
    ]);
  });

  it('shows signData text, and warns on binary data and cells', () => {
    const text = signingReview({ ...base, method: 'signData', signData: { type: 'text', text: 'Log in to Example' }, domain: 'app.example' });

    expect(text).toMatchObject({ feeKind: 'signOnly', blind: false, actions: [{ kind: 'message', text: 'Log in to Example' }] });

    const hidden = signingReview({ ...base, method: 'signData', signData: { type: 'text', text: 'pay‮moc' } });

    expect(hidden.blind).toBe(true);

    const binary = signingReview({ ...base, method: 'signData', signData: { type: 'binary', byteLength: 2, bytesHex: '00ff' } });

    expect(binary).toMatchObject({ blind: true, actions: [{ kind: 'unknown', text: '2 bytes: 00ff' }] });

    const cell = signingReview({ ...base, method: 'signData', signData: { type: 'cell', schema: 'a#_ x:uint8 = A;', cellBase64: 'te6' } });

    expect(cell).toMatchObject({ blind: true, actions: [{ kind: 'unknown', text: 'TL-B: a#_ x:uint8 = A;' }] });
  });

  it('blocks a transaction request without messages', () => {
    expect(signingReview(base).blocked).toBe(true);
  });
});
