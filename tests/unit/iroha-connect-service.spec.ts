import { ed25519 } from '@noble/curves/ed25519';

import { IrohaConnectService, type IrohaConnectSocket } from '@extension-base/services/iroha-connect-service';
import {
  LEGACY_IROHA_CONNECT_PROFILES,
  buildLegacyIrohaConnectApprovalPreimage,
  decodeLegacyIrohaConnectFrame,
} from '@extension-base/services/iroha-connect-service/legacyWire';
import { WalletEcosystem } from '@/interfaces';
import { encodeIrohaI105Address } from '@/util/iroha';
import { deriveIrohaSigningKey } from '@/util/irohaKeyring';

const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const SID_BYTES = new Uint8Array(32).fill(0x11);
const APP_PUBLIC_KEY = new Uint8Array(32).fill(0x22);
const WALLET_PRIVATE_KEY = new Uint8Array(32).fill(0x33);
const WALLET_PUBLIC_KEY = new Uint8Array(32).fill(0x44);
const TOKEN_BYTES = new Uint8Array(32).fill(0x55);
const SIGNING_MESSAGE = new Uint8Array([0, 1, 2, 3, 0xfe, 0xff]);
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const toBase64Url = (value: Uint8Array): string =>
  Buffer.from(value).toString('base64').replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');

const SID = toBase64Url(SID_BYTES);
const TOKEN = toBase64Url(TOKEN_BYTES);

const concatBytes = (...parts: Uint8Array[]): Uint8Array => {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
};

const u32 = (value: number): Uint8Array => {
  const output = new Uint8Array(4);
  new DataView(output.buffer).setUint32(0, value, true);
  return output;
};

const u64 = (value: number): Uint8Array => {
  const output = new Uint8Array(8);
  new DataView(output.buffer).setBigUint64(0, BigInt(value), true);
  return output;
};

const field = (payload: Uint8Array): Uint8Array => concatBytes(u64(payload.length), payload);
const struct = (fields: Uint8Array[]): Uint8Array => concatBytes(...fields.map(field));
const string = (value: string): Uint8Array => field(textEncoder.encode(value));
const tagged = (tag: number, payload: Uint8Array): Uint8Array => concatBytes(u32(tag), u64(payload.length), payload);
const optionString = (value?: string): Uint8Array =>
  value === undefined ? Uint8Array.of(0) : concatBytes(Uint8Array.of(1), field(string(value)));

const openFrame = ({ sequence = 1 }: { sequence?: number } = {}): Uint8Array => {
  const appMeta = concatBytes(
    Uint8Array.of(1),
    field(struct([string('Uranai'), optionString('https://uranai.sora.org/markets/demo'), optionString(undefined)]))
  );
  const body = struct([
    APP_PUBLIC_KEY,
    appMeta,
    struct([string(LEGACY_IROHA_CONNECT_PROFILES.taira.chainId)]),
    Uint8Array.of(0),
  ]);

  return struct([SID_BYTES, u32(0), u64(sequence), tagged(0, tagged(0, body))]);
};

const appCiphertextFrame = (value: unknown, sequence: number): Uint8Array => {
  const payload = textEncoder.encode(JSON.stringify(value));
  const body = struct([u32(0), concatBytes(u64(payload.length), payload)]);

  return struct([SID_BYTES, u32(0), u64(sequence), tagged(1, body)]);
};

const appPingFrame = (sequence: number, nonce: number): Uint8Array =>
  struct([SID_BYTES, u32(0), u64(sequence), tagged(0, tagged(4, struct([u64(nonce)])))]);

const walletUri = (): string => {
  const profile = LEGACY_IROHA_CONNECT_PROFILES.taira;

  return `iroha://connect?${new URLSearchParams({
    sid: SID,
    chain_id: profile.chainId,
    node: profile.toriiBaseUrl,
    v: '1',
    role: 'wallet',
    token: TOKEN,
  }).toString()}`;
};

class FakeSocket implements IrohaConnectSocket {
  binaryType = '';
  readyState = 1;
  onclose: ((event?: unknown) => void) | null = null;
  onerror: ((event?: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onopen: ((event?: unknown) => void) | null = null;
  readonly sent: Uint8Array[] = [];
  readonly textSent: string[] = [];
  readonly close = vi.fn(() => {
    this.readyState = 3;
  });

  send(data: string | Uint8Array): void {
    if (typeof data === 'string') this.textSent.push(data);
    else this.sent.push(data.slice());
  }

  emit(data: Uint8Array): void {
    this.onmessage?.({ data });
  }
}

class Cursor {
  private offset = 0;

  constructor(private readonly bytes: Uint8Array) {}

  readBytes(length: number): Uint8Array {
    const result = this.bytes.slice(this.offset, this.offset + length);
    this.offset += length;
    return result;
  }

  readU32(): number {
    const bytes = this.readBytes(4);
    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, true);
  }

  readU64(): number {
    const bytes = this.readBytes(8);
    return Number(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getBigUint64(0, true));
  }

  readField(): Uint8Array {
    return this.readBytes(this.readU64());
  }
}

const readFields = (bytes: Uint8Array): Uint8Array[] => {
  const cursor = new Cursor(bytes);
  const fields: Uint8Array[] = [];
  let consumed = 0;
  while (consumed < bytes.length) {
    const value = cursor.readField();
    fields.push(value);
    consumed += 8 + value.length;
  }
  expect(consumed).toBe(bytes.length);
  return fields;
};

const readTagged = (bytes: Uint8Array): { body: Uint8Array; tag: number } => {
  const cursor = new Cursor(bytes);
  const tag = cursor.readU32();
  const body = cursor.readBytes(cursor.readU64());
  return { body, tag };
};

const decodeLegacySignature = (bytes: Uint8Array): Uint8Array => {
  const [algorithm, vector] = readFields(bytes);
  expect(new Cursor(algorithm).readU32()).toBe(0);
  const vectorCursor = new Cursor(vector);
  expect(vectorCursor.readU64()).toBe(64);

  return concatBytes(...Array.from({ length: 64 }, () => new Cursor(vectorCursor.readField()).readBytes(1)));
};

const decodeApproval = (frame: Uint8Array) => {
  const outer = readFields(frame);
  expect(new Cursor(outer[1]).readU32()).toBe(1);
  const sequence = new Cursor(outer[2]).readU64();
  const kind = readTagged(outer[3]);
  const control = readTagged(kind.body);
  const [walletPublicKey, accountString, proof, permissions, signature] = readFields(control.body);

  return {
    accountId: textDecoder.decode(new Cursor(accountString).readField()),
    controlTag: control.tag,
    frameTag: kind.tag,
    permissions,
    proof,
    sequence,
    signature: decodeLegacySignature(signature),
    sid: outer[0],
    walletPublicKey,
  };
};

const decodeWalletJson = (frame: Uint8Array): Record<string, unknown> => {
  const decoded = decodeLegacyIrohaConnectFrame(frame, {
    expectedSid: SID,
    expectedDirection: 'wallet-to-app',
  });
  expect(decoded.kind).toBe('ciphertext');
  if (decoded.kind !== 'ciphertext') throw new Error('Expected a ciphertext frame');

  return JSON.parse(textDecoder.decode(decoded.aead)) as Record<string, unknown>;
};

const contractRequest = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  schema: 'uranai.irohaconnect.contract-call-signature.v1',
  kind: 'contract_call_signature_request',
  requestId: 'request-one',
  accountId: '',
  signingMessageB64: Buffer.from(SIGNING_MESSAGE).toString('base64'),
  contractAlias: 'uranai',
  entrypoint: 'create_market',
  ...overrides,
});

const createHarness = (
  onStateChange: (
    snapshot: IrohaConnectService['snapshot'],
    previous: IrohaConnectService['snapshot']
  ) => void = vi.fn()
) => {
  const derived = deriveIrohaSigningKey({ mnemonic: MNEMONIC });
  const accountId = encodeIrohaI105Address(derived.publicKeyHex, 'taira');
  const storedAccount = {
    address: 'stored-iroha-account',
    meta: {
      irohaPublicKeyHex: derived.publicKeyHex,
      name: 'Sakura',
      walletEcosystem: WalletEcosystem.Iroha,
    },
  };
  const observableAccount = {
    json: {
      address: storedAccount.address,
      meta: storedAccount.meta,
    },
    type: 'ed25519',
  };
  const socket = new FakeSocket();
  const keyringService = {
    accountSubject: { value: { primary: observableAccount } },
    addressSubject: { value: {} },
    exportMnemonic: vi.fn(() => ({ seed: MNEMONIC })),
    getAccounts: vi.fn(() => [storedAccount]),
    keyringIsLocked: false,
  };
  const createSocket = vi.fn(() => socket);
  const service = new IrohaConnectService({ keyringService } as never, {
    createSocket,
    makeWalletKeyPair: () => ({ privateKey: WALLET_PRIVATE_KEY.slice(), publicKey: WALLET_PUBLIC_KEY.slice() }),
    onStateChange,
  });

  return { accountId, createSocket, derived, keyringService, onStateChange, service, socket };
};

const openAndApprove = async (
  onStateChange?: (snapshot: IrohaConnectService['snapshot'], previous: IrohaConnectService['snapshot']) => void
) => {
  const harness = createHarness(onStateChange);
  harness.service.connect(walletUri());
  harness.socket.emit(openFrame());
  await harness.service.approveSession(harness.accountId);

  return harness;
};

describe('IrohaConnectService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-31T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('connects to the authenticated relay and exposes the Open session for explicit approval', () => {
    const { accountId, createSocket, service, socket } = createHarness();

    expect(service.connect(walletUri())).toMatchObject({ phase: 'connecting', accounts: [] });
    expect(createSocket).toHaveBeenCalledWith(`wss://taira.sora.org/v1/connect/ws?sid=${SID}&role=wallet`, [
      `iroha-connect.token.v1.${toBase64Url(textEncoder.encode(TOKEN))}`,
    ]);
    expect(socket.binaryType).toBe('arraybuffer');

    socket.emit(openFrame());

    expect(service.snapshot).toMatchObject({
      phase: 'session-approval',
      accounts: [{ address: accountId, name: 'Sakura', network: 'taira' }],
      session: {
        appName: 'Uranai',
        appUrl: 'https://uranai.sora.org/markets/demo',
        network: 'taira',
      },
    });
    expect(socket.sent).toEqual([]);
  });

  it('signs the exact approval preimage and emits the deployed Taira approval shape', async () => {
    const { accountId, derived, service, socket } = await openAndApprove();

    expect(service.snapshot).toMatchObject({ phase: 'connected', selectedAccountId: accountId });
    expect(socket.sent).toHaveLength(1);
    const approval = decodeApproval(socket.sent[0]);
    const expectedPreimage = buildLegacyIrohaConnectApprovalPreimage({
      sid: SID,
      appPublicKey: APP_PUBLIC_KEY,
      walletPublicKey: WALLET_PUBLIC_KEY,
      accountId,
    });

    expect(approval).toMatchObject({
      accountId,
      controlTag: 1,
      frameTag: 0,
      sequence: 1,
      sid: SID_BYTES,
      walletPublicKey: WALLET_PUBLIC_KEY,
      proof: Uint8Array.of(0),
      permissions: Uint8Array.of(0),
    });
    expect(ed25519.verify(approval.signature, expectedPreimage, derived.publicKeyHex)).toBe(true);
  });

  it('keeps an approved background session alive without creating protocol heartbeat obligations', async () => {
    const { service, socket } = await openAndApprove();

    vi.advanceTimersByTime(60_000);

    expect(socket.textSent).toEqual(['keepalive', 'keepalive', 'keepalive']);
    expect(socket.sent).toHaveLength(1);

    service.disconnect();
    const textSentAfterDisconnect = socket.textSent.length;
    vi.advanceTimersByTime(60_000);
    expect(socket.textSent).toHaveLength(textSentAfterDisconnect);
  });

  it('keeps the relay active while the user reviews the initial session approval', async () => {
    const { accountId, service, socket } = createHarness();
    service.connect(walletUri());
    socket.emit(openFrame());

    vi.advanceTimersByTime(20_000);

    expect(service.snapshot.phase).toBe('session-approval');
    expect(socket.textSent).toEqual(['keepalive']);
    expect(socket.sent).toEqual([]);

    await service.approveSession(accountId);
    expect(decodeApproval(socket.sent.at(-1)!).sequence).toBe(1);
  });

  it('offers only locally signable Iroha accounts for session approval', () => {
    const { keyringService, service, socket } = createHarness();
    (keyringService.accountSubject.value.primary.json.meta as Record<string, unknown>).isHardware = true;
    keyringService.addressSubject.value = {
      watched: {
        ...keyringService.accountSubject.value.primary,
        json: {
          ...keyringService.accountSubject.value.primary.json,
          meta: { ...keyringService.accountSubject.value.primary.json.meta, isHardware: false },
        },
      },
    };

    service.connect(walletUri());
    socket.emit(openFrame());

    expect(service.snapshot).toMatchObject({ phase: 'session-approval', accounts: [] });
  });

  it('answers app Ping controls and preserves contiguous request sequencing', async () => {
    const { accountId, service, socket } = await openAndApprove();

    socket.emit(appPingFrame(2, 77));

    const outer = readFields(socket.sent.at(-1)!);
    const control = readTagged(readTagged(outer[3]).body);
    const [nonce] = readFields(control.body);
    expect(control.tag).toBe(5);
    expect(new Cursor(nonce).readU64()).toBe(77);

    socket.emit(appCiphertextFrame(contractRequest({ accountId }), 3));
    expect(service.snapshot).toMatchObject({ phase: 'request-approval', request: { requestId: 'request-one' } });
  });

  it('signs the exact contract bytes and returns the matching account public key', async () => {
    const onStateChange = vi.fn();
    const { accountId, derived, service, socket } = await openAndApprove(onStateChange);
    socket.emit(appCiphertextFrame(contractRequest({ accountId }), 2));

    expect(onStateChange.mock.calls.filter(([snapshot]) => snapshot.phase === 'request-approval')).toHaveLength(1);
    expect(onStateChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ phase: 'request-approval' }),
      expect.objectContaining({ phase: 'connected' })
    );
    expect(service.snapshot).toMatchObject({
      phase: 'request-approval',
      request: {
        requestId: 'request-one',
        accountId,
        signingMessageBytes: SIGNING_MESSAGE.length,
        signingMessageSha256: '7ea646958715ed687aa9ac2f5d785feb1a93411f4f25fdd6c7fcc6ab07fdf0e3',
      },
    });
    service.approveRequest('request-one');

    const response = decodeWalletJson(socket.sent.at(-1)!);
    expect(response).toMatchObject({
      schema: 'uranai.irohaconnect.contract-call-signature.v1',
      kind: 'contract_call_signature_response',
      requestId: 'request-one',
      publicKeyHex: derived.publicKeyHex,
    });
    expect(
      ed25519.verify(Buffer.from(response.signatureB64 as string, 'base64'), SIGNING_MESSAGE, derived.publicKeyHex)
    ).toBe(true);
    expect(service.snapshot).toMatchObject({ phase: 'connected', request: undefined });
  });

  it('rejects account mismatch without presenting a signing approval', async () => {
    const onStateChange = vi.fn();
    const { accountId, service, socket } = await openAndApprove(onStateChange);
    const transitionsBeforeRequest = onStateChange.mock.calls.length;
    socket.emit(appCiphertextFrame(contractRequest({ accountId: `${accountId}-other` }), 2));

    expect(service.snapshot.phase).toBe('connected');
    expect(onStateChange).toHaveBeenCalledTimes(transitionsBeforeRequest);
    expect(decodeWalletJson(socket.sent.at(-1)!)).toMatchObject({
      kind: 'contract_call_signature_reject',
      requestId: 'request-one',
      code: 'account_mismatch',
    });
  });

  it('explicitly rejects private proof requests while keeping the approved session open', async () => {
    const { service, socket } = await openAndApprove();
    socket.emit(
      appCiphertextFrame(
        {
          schema: 'uranai.irohaconnect.private-trade-proof.v1',
          kind: 'private_trade_proof_request',
          requestId: 'private-one',
        },
        2
      )
    );

    expect(service.snapshot.phase).toBe('connected');
    expect(decodeWalletJson(socket.sent.at(-1)!)).toMatchObject({
      kind: 'private_trade_proof_reject',
      requestId: 'private-one',
      code: 'unsupported_private_proof',
    });
  });

  it('keeps the first concurrent request pending and rejects the second', async () => {
    const { accountId, service, socket } = await openAndApprove();
    socket.emit(appCiphertextFrame(contractRequest({ accountId }), 2));
    socket.emit(appCiphertextFrame(contractRequest({ accountId, requestId: 'request-two' }), 3));

    expect(service.snapshot).toMatchObject({ phase: 'request-approval', request: { requestId: 'request-one' } });
    expect(decodeWalletJson(socket.sent.at(-1)!)).toMatchObject({
      kind: 'contract_call_signature_reject',
      requestId: 'request-two',
      code: 'request_in_progress',
    });
  });

  it('expires pending signatures, disconnects cleanly, and fails closed after teardown', async () => {
    const { accountId, service, socket } = await openAndApprove();
    socket.emit(appCiphertextFrame(contractRequest({ accountId }), 2));

    vi.advanceTimersByTime(90_000);

    expect(service.snapshot).toMatchObject({ phase: 'connected', request: undefined });
    expect(decodeWalletJson(socket.sent.at(-1)!)).toMatchObject({
      kind: 'contract_call_signature_reject',
      requestId: 'request-one',
      code: 'request_expired',
    });

    expect(service.disconnect()).toEqual({ accounts: [], phase: 'idle' });
    expect(socket.close).toHaveBeenCalledWith(1000, 'Wallet session closed');
    expect(() => service.approveRequest('request-one')).toThrow('session is not active');
  });

  it('closes the transport on replayed, out-of-order, or pre-Open application data', async () => {
    const first = await openAndApprove();
    first.socket.emit(appCiphertextFrame(contractRequest({ accountId: first.accountId }), 1));

    expect(first.service.snapshot).toMatchObject({ phase: 'error', error: expect.stringContaining('replayed') });
    expect(first.socket.close).toHaveBeenCalled();

    const second = createHarness();
    second.service.connect(walletUri());
    second.socket.emit(appCiphertextFrame(contractRequest({ accountId: second.accountId }), 2));

    expect(second.service.snapshot).toMatchObject({
      phase: 'error',
      error: expect.stringContaining('before opening'),
    });
    expect(second.socket.close).toHaveBeenCalled();

    const third = await openAndApprove();
    third.socket.emit(appCiphertextFrame(contractRequest({ accountId: third.accountId }), 3));

    expect(third.service.snapshot).toMatchObject({
      phase: 'error',
      error: expect.stringContaining('out-of-order'),
    });
    expect(third.socket.close).toHaveBeenCalled();
  });

  it('keeps the protocol request pending when the best-effort UI notification fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onStateChange = vi.fn((snapshot: IrohaConnectService['snapshot']) => {
      if (snapshot.phase === 'request-approval') throw new Error('Popup unavailable');
    });

    try {
      const { accountId, service, socket } = await openAndApprove(onStateChange);
      socket.emit(appCiphertextFrame(contractRequest({ accountId }), 2));

      expect(service.snapshot).toMatchObject({ phase: 'request-approval', request: { requestId: 'request-one' } });
      expect(socket.close).not.toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalledWith(
        'Unable to update the IrohaConnect request UI.',
        expect.objectContaining({ message: 'Popup unavailable' })
      );
    } finally {
      consoleError.mockRestore();
    }
  });
});
