import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { Address, beginCell, Cell, contractAddress, loadStateInit, storeStateInit } from '@ton/core';
import { keyPairFromSeed, sign, signVerify } from '@ton/crypto';
import { WalletContractV4 } from '@ton/ton';
import {
  CONNECT_ERROR,
  RPC_ERROR,
  TON_CONNECT_MAX_MESSAGES,
  TonConnectError,
  crc32,
  encodeDnsLikeDomain,
  isTonConnectPageOrigin,
  parseAppRequest,
  parseConnectRequest,
  parseSendTransactionParams,
  parseSignDataParams,
  previewTonMessage,
  requestIdFollows,
  signDataSigningHash,
  tonConnectDeviceInfo,
  tonConnectSigningDomain,
  tonProofSigningHash,
  walletStateInitBase64,
} from '@/util/tonConnect/protocol';

const keyPair = keyPairFromSeed(Buffer.alloc(32, 7));
const wallet = WalletContractV4.create({ workchain: 0, publicKey: keyPair.publicKey });
const account = wallet.address;
const NOW = 1_800_000_000;
const other = Address.parse('EQBvW8Z5huBkMJYdnfAEM5JqTNkuWX3diqYENkWsIL0XggGG');

const hex = (bytes: Uint8Array): string => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

const code = (fn: () => unknown): number | undefined => {
  try {
    fn();
  } catch (error) {
    if (error instanceof TonConnectError) return error.code;
    throw error;
  }
  return undefined;
};

// The reference verifiers of ton-connect/demo-dapp-with-react-ui (src/server/services), written with Buffer as they
// are, so the wallet's DataView encoding is checked against an independent reading of the byte layout.
function referenceProofHash(address: Address, domain: string, timestamp: number, payload: string): Buffer {
  const wc = Buffer.alloc(4);
  wc.writeUInt32BE(address.workChain >>> 0, 0);
  const ts = Buffer.alloc(8);
  ts.writeBigUInt64LE(BigInt(timestamp), 0);
  const dl = Buffer.alloc(4);
  dl.writeUInt32LE(Buffer.from(domain).length, 0);
  const msg = Buffer.concat([
    Buffer.from('ton-proof-item-v2/'),
    wc,
    address.hash,
    dl,
    Buffer.from(domain),
    ts,
    Buffer.from(payload),
  ]);
  const msgHash = createHash('sha256').update(msg).digest();
  return createHash('sha256')
    .update(Buffer.concat([Buffer.from([0xff, 0xff]), Buffer.from('ton-connect'), msgHash]))
    .digest();
}

function referenceTextBinaryHash(address: Address, domain: string, timestamp: number, type: 'text' | 'binary', content: string) {
  const wcBuffer = Buffer.alloc(4);
  wcBuffer.writeInt32BE(address.workChain);
  const domainBuffer = Buffer.from(domain, 'utf8');
  const domainLenBuffer = Buffer.alloc(4);
  domainLenBuffer.writeUInt32BE(domainBuffer.length);
  const tsBuffer = Buffer.alloc(8);
  tsBuffer.writeBigUInt64BE(BigInt(timestamp));
  const payloadBuffer = Buffer.from(content, type === 'text' ? 'utf8' : 'base64');
  const payloadLenBuffer = Buffer.alloc(4);
  payloadLenBuffer.writeUInt32BE(payloadBuffer.length);
  const message = Buffer.concat([
    Buffer.from([0xff, 0xff]),
    Buffer.from('ton-connect/sign-data/'),
    wcBuffer,
    address.hash,
    domainLenBuffer,
    domainBuffer,
    tsBuffer,
    Buffer.from(type === 'text' ? 'txt' : 'bin'),
    payloadLenBuffer,
    payloadBuffer,
  ]);
  return createHash('sha256').update(message).digest();
}

describe('TON Connect device and features', () => {
  it('advertises v2 with four raw messages and every signData type, and names the app as the mobile apps do', () => {
    expect(tonConnectDeviceInfo('4.2.9', 'mac')).toEqual({
      platform: 'mac',
      appName: 'Fearless',
      appVersion: '4.2.9',
      maxProtocolVersion: 2,
      features: [
        'SendTransaction',
        { name: 'SendTransaction', maxMessages: TON_CONNECT_MAX_MESSAGES },
        { name: 'SignData', types: ['text', 'binary', 'cell'] },
      ],
    });
  });
});

describe('TON Connect page origins and signing domains', () => {
  it('answers HTTPS pages and plain HTTP only on this computer', () => {
    expect(isTonConnectPageOrigin('https://app.ston.fi')).toBe(true);
    expect(isTonConnectPageOrigin('http://localhost:5173')).toBe(true);
    expect(isTonConnectPageOrigin('http://127.0.0.1:8080')).toBe(true);
    expect(isTonConnectPageOrigin('http://app.ston.fi')).toBe(false);
    expect(isTonConnectPageOrigin('null')).toBe(false);
    expect(isTonConnectPageOrigin('https://app.ston.fi/path')).toBe(false);
  });

  it('binds the host the browser reports, port included, and refuses names without a dot', () => {
    expect(tonConnectSigningDomain('https://app.ston.fi')).toBe('app.ston.fi');
    expect(tonConnectSigningDomain('https://dapp.example:8443')).toBe('dapp.example:8443');
    expect(tonConnectSigningDomain('http://127.0.0.1:5173')).toBe('127.0.0.1:5173');
    expect(code(() => tonConnectSigningDomain('http://localhost:5173'))).toBe(CONNECT_ERROR.BAD_REQUEST);
    expect(code(() => tonConnectSigningDomain('http://[::1]:5173'))).toBe(CONNECT_ERROR.BAD_REQUEST);
  });

  it('encodes a domain in DNS order with a zero after each label', () => {
    expect(encodeDnsLikeDomain('app.ston.fi')).toBe('fi\0ston\0app\0');
  });
});

describe('TON Connect connect requests', () => {
  it('reads the address and proof items and lists unknown items for a per-item error', () => {
    expect(
      parseConnectRequest({
        manifestUrl: 'https://app.example/tonconnect-manifest.json',
        items: [{ name: 'ton_addr', network: '-239' }, { name: 'ton_proof', payload: 'nonce' }, { name: 'future_item' }],
      })
    ).toEqual({
      manifestUrl: 'https://app.example/tonconnect-manifest.json',
      addressItem: { name: 'ton_addr', network: '-239' },
      proof: { name: 'ton_proof', payload: 'nonce' },
      unsupportedItems: ['future_item'],
    });
  });

  it('refuses a request without an address, a bad manifest URL or an oversized proof payload', () => {
    expect(code(() => parseConnectRequest({ manifestUrl: 'https://a.b/m.json', items: [{ name: 'ton_proof', payload: 'x' }] }))).toBe(
      CONNECT_ERROR.BAD_REQUEST
    );
    expect(code(() => parseConnectRequest({ manifestUrl: 7, items: [{ name: 'ton_addr' }] }))).toBe(CONNECT_ERROR.BAD_REQUEST);
    expect(
      code(() =>
        parseConnectRequest({ manifestUrl: 'https://a.b/m.json', items: [{ name: 'ton_addr' }, { name: 'ton_proof', payload: 'x'.repeat(1025) }] })
      )
    ).toBe(CONNECT_ERROR.BAD_REQUEST);
  });
});

describe('TON Connect RPC envelope', () => {
  it('reads numeric ids and requires each to rise', () => {
    expect(parseAppRequest({ id: '7', method: 'disconnect', params: [] })).toEqual({ id: '7', method: 'disconnect', params: [] });
    expect(code(() => parseAppRequest({ id: 'abc', method: 'disconnect', params: [] }))).toBe(RPC_ERROR.BAD_REQUEST);
    expect(code(() => parseAppRequest({ id: '1', method: 'x', params: 'no' }))).toBe(RPC_ERROR.BAD_REQUEST);
    expect(requestIdFollows('0', undefined)).toBe(true);
    expect(requestIdFollows('10', '9')).toBe(true);
    expect(requestIdFollows('9', '9')).toBe(false);
    expect(requestIdFollows('8', '9')).toBe(false);
  });
});

describe('TON Connect sendTransaction', () => {
  const bounceable = other.toString({ bounceable: true, urlSafe: true });
  const nonBounceable = other.toString({ bounceable: false, urlSafe: true });
  const tx = (payload: Record<string, unknown>) => [JSON.stringify(payload)];

  it('reads messages with the bounce flag each friendly address carries', () => {
    const parsed = parseSendTransactionParams(
      tx({
        valid_until: NOW + 300,
        network: '-239',
        from: account.toRawString(),
        messages: [
          { address: bounceable, amount: '1000' },
          { address: nonBounceable, amount: '2' },
        ],
      }),
      account,
      NOW
    );
    expect(parsed.validUntil).toBe(NOW + 300);
    expect(parsed.messages.map(({ bounce, amount }) => [bounce, amount])).toEqual([
      [true, 1000n],
      [false, 2n],
    ]);
    expect(parsed.messages[0].destination.equals(other)).toBe(true);
  });

  it('reads a millisecond valid_until as milliseconds and caps how long a message stays valid', () => {
    expect(parseSendTransactionParams(tx({ valid_until: (NOW + 60) * 1000, messages: [{ address: bounceable, amount: '1' }] }), account, NOW).validUntil).toBe(NOW + 60);
    expect(parseSendTransactionParams(tx({ valid_until: NOW + 10 * 86400, messages: [{ address: bounceable, amount: '1' }] }), account, NOW).validUntil).toBe(NOW + 86400);
  });

  it.each([
    ['an expired request', { valid_until: NOW - 1, messages: [{ address: bounceable, amount: '1' }] }],
    ['another network', { network: '-3', messages: [{ address: bounceable, amount: '1' }] }],
    ['another sender', { from: other.toRawString(), messages: [{ address: bounceable, amount: '1' }] }],
    ['a raw destination', { messages: [{ address: other.toRawString(), amount: '1' }] }],
    ['a test-network destination', { messages: [{ address: other.toString({ testOnly: true }), amount: '1' }] }],
    ['no messages', { messages: [] }],
    ['five messages', { messages: Array(5).fill({ address: bounceable, amount: '1' }) }],
    ['a fractional amount', { messages: [{ address: bounceable, amount: '1.5' }] }],
    ['an extra currency', { messages: [{ address: bounceable, amount: '1', extra_currency: { 100: '1' } }] }],
    ['a payload with two roots', { messages: [{ address: bounceable, amount: '1', payload: Buffer.from(beginCell().endCell().toBoc()).toString('base64') + 'AA' }] }],
  ])('refuses %s as a bad request', (_, payload) => {
    expect(code(() => parseSendTransactionParams(tx(payload), account, NOW))).toBe(RPC_ERROR.BAD_REQUEST);
  });

  it('refuses structured items, which it does not advertise', () => {
    expect(code(() => parseSendTransactionParams(tx({ items: [{ type: 'ton', address: bounceable, amount: '1' }] }), account, NOW))).toBe(
      RPC_ERROR.METHOD_NOT_SUPPORTED
    );
  });

  it('reads a payload and a state init', () => {
    const payload = beginCell().storeUint(0, 32).storeStringTail('hello').endCell();
    const init = { code: beginCell().storeUint(1, 8).endCell(), data: beginCell().storeUint(2, 8).endCell() };
    const stateInit = beginCell().store(storeStateInit(init)).endCell();
    const [message] = parseSendTransactionParams(
      tx({
        messages: [
          {
            address: contractAddress(0, init).toString({ bounceable: true }),
            amount: '5',
            payload: payload.toBoc().toString('base64'),
            stateInit: stateInit.toBoc().toString('base64'),
          },
        ],
      }),
      account,
      NOW
    ).messages;
    expect(message.payload?.equals(payload)).toBe(true);
    expect(message.stateInit?.code?.equals(init.code)).toBe(true);
    expect(previewTonMessage(message)).toMatchObject({ kind: 'comment', comment: 'hello', deploysContract: true, amount: '5' });
  });
});

describe('TON Connect message previews', () => {
  const message = (payload?: Cell) => ({
    address: other.toString({ bounceable: true }),
    destination: other,
    bounce: true,
    amount: 50_000_000n,
    payload,
  });

  it('decodes a jetton transfer with its forward comment', () => {
    const forward = beginCell().storeUint(0, 32).storeStringTail('swap').endCell();
    const body = beginCell()
      .storeUint(0x0f8a7ea5, 32)
      .storeUint(1, 64)
      .storeCoins(1234567n)
      .storeAddress(account)
      .storeAddress(other)
      .storeBit(0)
      .storeCoins(1n)
      .storeBit(1)
      .storeRef(forward)
      .endCell();
    expect(previewTonMessage(message(body))).toMatchObject({
      kind: 'jettonTransfer',
      jetton: {
        amount: '1234567',
        destination: account.toString({ bounceable: true, urlSafe: true }),
        responseDestination: other.toString({ bounceable: true, urlSafe: true }),
        forwardTon: '1',
        forwardComment: 'swap',
      },
    });
  });

  it('decodes an NFT transfer', () => {
    const body = beginCell()
      .storeUint(0x5fcc3d14, 32)
      .storeUint(0, 64)
      .storeAddress(account)
      .storeAddress(account)
      .storeBit(0)
      .storeCoins(10n)
      .storeBit(0)
      .endCell();
    expect(previewTonMessage(message(body))).toMatchObject({ kind: 'nftTransfer', nft: { forwardTon: '10' } });
  });

  it('marks an unknown body and a comment with hidden controls as unknown', () => {
    expect(previewTonMessage(message(beginCell().storeUint(0xdeadbeef, 32).endCell()))).toMatchObject({ kind: 'unknown', opcode: '0xdeadbeef' });
    expect(previewTonMessage(message(beginCell().storeUint(0, 32).storeStringTail('a‮b').endCell())).kind).toBe('unknown');
    expect(previewTonMessage(message())).toMatchObject({ kind: 'transfer', amount: '50000000' });
  });
});

describe('TON Connect signatures', () => {
  it('builds the ton_proof hash the reference verifier checks', () => {
    const hash = tonProofSigningHash({ address: account, domain: 'app.example:8443', timestamp: NOW, payload: 'nonce-123' });
    expect(hex(hash)).toBe(hex(referenceProofHash(account, 'app.example:8443', NOW, 'nonce-123')));
    const masterchain = Address.parseRaw(`-1:${'ab'.repeat(32)}`);
    expect(hex(tonProofSigningHash({ address: masterchain, domain: 'a.b', timestamp: NOW, payload: '' }))).toBe(
      hex(referenceProofHash(masterchain, 'a.b', NOW, ''))
    );
    const signature = sign(Buffer.from(hash), keyPair.secretKey);
    expect(signVerify(Buffer.from(hash), signature, keyPair.publicKey)).toBe(true);
  });

  it('builds the signData text and binary hashes the reference verifier checks', () => {
    const text = parseSignDataParams([JSON.stringify({ type: 'text', text: 'Sign in ✓', network: '-239' })], account);
    expect(text.echo).toEqual({ type: 'text', text: 'Sign in ✓', network: '-239' });
    expect(hex(signDataSigningHash({ address: account, domain: 'app.example', timestamp: NOW, data: text.data }))).toBe(
      hex(referenceTextBinaryHash(account, 'app.example', NOW, 'text', 'Sign in ✓'))
    );
    const bytes = Buffer.from([0, 1, 2, 250]).toString('base64');
    const binary = parseSignDataParams([JSON.stringify({ type: 'binary', bytes })], account);
    expect(hex(signDataSigningHash({ address: account, domain: 'app.example', timestamp: NOW, data: binary.data }))).toBe(
      hex(referenceTextBinaryHash(account, 'app.example', NOW, 'binary', bytes))
    );
  });

  it('builds the signData cell message the reference verifier checks', () => {
    const payloadCell = beginCell().storeUint(42, 16).endCell();
    const schema = 'message#_ value:uint16 = Message;';
    const parsed = parseSignDataParams([JSON.stringify({ type: 'cell', schema, cell: payloadCell.toBoc().toString('base64') })], account);
    const expected = beginCell()
      .storeUint(0x75569022, 32)
      .storeUint(crc32(Buffer.from(schema, 'utf8')), 32)
      .storeUint(NOW, 64)
      .storeAddress(account)
      .storeStringRefTail('example\0app\0')
      .storeRef(payloadCell)
      .endCell()
      .hash();
    expect(hex(signDataSigningHash({ address: account, domain: 'app.example', timestamp: NOW, data: parsed.data }))).toBe(hex(expected));
  });

  it('computes CRC-32 as the crc-32 package does', () => {
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it('refuses signData for another network, another signer or an unknown type', () => {
    expect(code(() => parseSignDataParams([JSON.stringify({ type: 'text', text: 'x', network: '-3' })], account))).toBe(RPC_ERROR.BAD_REQUEST);
    expect(code(() => parseSignDataParams([JSON.stringify({ type: 'text', text: 'x', from: other.toRawString() })], account))).toBe(
      RPC_ERROR.BAD_REQUEST
    );
    expect(code(() => parseSignDataParams([JSON.stringify({ type: 'image', data: 'x' })], account))).toBe(RPC_ERROR.METHOD_NOT_SUPPORTED);
  });
});

describe('TON Connect wallet state init', () => {
  it('serializes the wallet state init whose hash is the wallet address', () => {
    const boc = walletStateInitBase64(wallet.init);
    const init = loadStateInit(Cell.fromBase64(boc).beginParse());
    expect(contractAddress(0, init).equals(account)).toBe(true);
  });
});
