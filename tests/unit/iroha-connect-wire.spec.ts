import { NetworkId } from '@iroha/iroha-js/browser';
import { createConnectSessionPreview } from '@iroha/iroha-js/connect-browser';
import { x25519 } from '@noble/curves/ed25519';

import {
  IROHA_CONNECT_PROFILES,
  IrohaConnectError,
  buildIrohaConnectApprovalPreimage,
  buildIrohaConnectWebSocket,
  crc64Xz,
  decodeIrohaConnectFrame,
  deriveIrohaConnectDirectionKeys,
  encodeIrohaConnectApproveFrame,
  encodeIrohaConnectPingFrame,
  openIrohaConnectEnvelope,
  parseIrohaConnectUri,
  sealIrohaConnectEnvelope,
  toBase64Url,
} from '@extension-base/services/iroha-connect-service/wire';
import openCapture from '../fixtures/iroha-connect/taira-open-frame-20261121.json';

const TAIRA = IROHA_CONNECT_PROFILES.taira;
const TOKEN = toBase64Url(new Uint8Array(32).fill(0x55));
const RELAY = toBase64Url(new Uint8Array(32).fill(0x66));
const hex = (value: string): Uint8Array => Uint8Array.from(Buffer.from(value, 'hex'));

const makeLink = (overrides: Record<string, string | null> = {}, scheme = 'iroha') => {
  const preview = createConnectSessionPreview({ networkId: NetworkId.parse(TAIRA.networkId!), node: TAIRA.toriiBaseUrl });
  const fields: Record<string, string | null> = {
    sid: preview.sidBase64Url,
    network_id: TAIRA.networkId,
    app_pk: toBase64Url(preview.appKeyPair.publicKey),
    nonce: toBase64Url(preview.nonce),
    node: TAIRA.toriiBaseUrl,
    v: '1',
    role: 'wallet',
    token: TOKEN,
    relay: RELAY,
    ...overrides,
  };
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(fields)) if (value !== null) params.append(name, value);
  return { preview, uri: `${scheme}://connect?${params.toString()}` };
};

const errorCode = (action: () => unknown): string | undefined => {
  try {
    action();
  } catch (error) {
    return error instanceof IrohaConnectError ? error.code : `other: ${(error as Error).message}`;
  }
  return undefined;
};

describe('IrohaConnect current v1 wire', () => {
  it('computes the Norito CRC-64/XZ check value', () => {
    expect(crc64Xz(new TextEncoder().encode('123456789'))).toBe(0x995dc9bbdf1939fan);
    expect(crc64Xz(new Uint8Array())).toBe(0n);
  });

  it('parses a Torii-registered Taira wallet link and binds its sid', () => {
    const { preview, uri } = makeLink();
    const parsed = parseIrohaConnectUri(uri);

    expect(parsed).toMatchObject({
      network: 'taira',
      networkId: TAIRA.networkId,
      networkPrefix: TAIRA.networkPrefix,
      node: 'https://taira.sora.org',
      sid: preview.sidBase64Url,
      token: TOKEN,
      relayToken: RELAY,
    });
    expect(Buffer.from(parsed.sidBytes)).toEqual(Buffer.from(preview.sidBytes));
    expect(Buffer.from(parsed.appPublicKey)).toEqual(Buffer.from(preview.appKeyPair.publicKey));
    expect(parseIrohaConnectUri(uri.replace(/^iroha:/u, 'irohaconnect:')).scheme).toBe('irohaconnect');
    expect(buildIrohaConnectWebSocket(parsed)).toEqual({
      url: `wss://taira.sora.org/v1/connect/ws?sid=${preview.sidBase64Url}&role=wallet`,
      protocols: [`iroha-connect.token.v1.${toBase64Url(new TextEncoder().encode(TOKEN))}`],
    });
  });

  it('refuses links that are not exact current Taira wallet invitations', () => {
    const legacy = `iroha://connect?sid=${toBase64Url(new Uint8Array(32).fill(1))}&chain_id=${TAIRA.chainId}&node=${TAIRA.toriiBaseUrl}&v=1&role=wallet&token=${TOKEN}`;
    expect(errorCode(() => parseIrohaConnectUri(legacy))).toBe('iroha_connect_retired_link');
    expect(errorCode(() => parseIrohaConnectUri(makeLink({ node: 'https://evil.example' }).uri))).toBe(
      'iroha_connect_wrong_node'
    );
    expect(errorCode(() => parseIrohaConnectUri(makeLink({ node: 'https://taira.sora.org/' }).uri))).toBe(
      'iroha_connect_wrong_node'
    );

    const other = NetworkId.fromBytes(Uint8Array.from({ length: 32 }, (_, index) => (index === 31 ? 1 : 7)));
    expect(errorCode(() => parseIrohaConnectUri(makeLink({ network_id: other.literal }).uri))).toBe(
      'iroha_connect_unknown_network'
    );
    expect(
      errorCode(() =>
        parseIrohaConnectUri(makeLink({ network_id: other.literal, node: 'https://minamoto.sora.org' }).uri)
      )
    ).toBe('iroha_connect_network_unavailable');

    const invalid = [
      makeLink({ role: 'app' }).uri,
      makeLink({ v: '2' }).uri,
      makeLink({ relay: null }).uri,
      makeLink({ extra: 'x' }).uri,
      makeLink({ token: `${TOKEN}=` }).uri,
      makeLink({ network_id: TAIRA.networkId!.toLowerCase() }).uri,
      makeLink({ sid: toBase64Url(new Uint8Array(32).fill(9)) }).uri,
      `${makeLink().uri}&sid=${toBase64Url(new Uint8Array(32).fill(9))}`,
      makeLink().uri.replace('connect?', 'connect/path?'),
      ` ${makeLink().uri}`,
      makeLink({}, 'https').uri,
    ];
    for (const uri of invalid) expect(errorCode(() => parseIrohaConnectUri(uri)), uri).toBe('iroha_connect_invalid_link');
  });

  it('decodes the Open frame captured from the live Taira relay', () => {
    const sidBytes = Uint8Array.from(Buffer.from(`${openCapture.sid.replace(/-/gu, '+').replace(/_/gu, '/')}=`, 'base64'));
    const frame = decodeIrohaConnectFrame(hex(openCapture.frameHex), { sidBytes });

    expect(frame).toMatchObject({ kind: 'control', direction: 'app-to-wallet', sequence: 1 });
    if (frame.kind !== 'control' || frame.control.type !== 'open') throw new Error('expected Open');
    expect(Buffer.from(frame.control.appPublicKey).toString('hex')).toBe(openCapture.appPublicKeyHex);
    expect(Buffer.from(frame.control.networkIdBytes).toString('hex')).toBe(openCapture.networkIdHex);
    expect(frame.control.appMeta).toEqual(openCapture.appMeta);
    expect(frame.control.permissions).toEqual(openCapture.permissions);
    expect(() => decodeIrohaConnectFrame(hex(openCapture.frameHex), { sidBytes: new Uint8Array(32).fill(1) })).toThrow(
      'iroha_connect_invalid_frame'
    );
    const truncated = hex(openCapture.frameHex).subarray(0, 900);
    expect(() => decodeIrohaConnectFrame(truncated, { sidBytes })).toThrow('iroha_connect_invalid_frame');
  });

  it('builds the approval preimage the app SDK verifies, and an approve frame Torii can relay', () => {
    const sidBytes = new Uint8Array(32).fill(0x11);
    const networkIdBytes = NetworkId.parse(TAIRA.networkId!).toBytes();
    const permissionsField = Uint8Array.of(0);
    const preimage = buildIrohaConnectApprovalPreimage({
      sidBytes,
      networkIdBytes,
      appPublicKey: new Uint8Array(32).fill(0x22),
      walletPublicKey: new Uint8Array(32).fill(0x44),
      accountId: 'account',
      permissionsField,
      relayToken: RELAY,
    });
    const text = new TextDecoder('latin1').decode(preimage);
    expect(text).toContain('iroha-connect|approve|v1');
    expect(text.indexOf('network_id')).toBeLessThan(text.indexOf('relay_auth'));
    expect(text).not.toContain('permissions');

    const frame = encodeIrohaConnectApproveFrame({
      sidBytes,
      sequence: 1,
      walletPublicKey: new Uint8Array(32).fill(0x44),
      accountId: 'account',
      permissionsField,
      signature: new Uint8Array(64).fill(7),
    });
    // sid and wallet key are element-framed `[u8; 32]`; the signature is a u32 algorithm plus 64 framed bytes.
    // frame 296+12+16+8+973: kind 12+control(12+body), body 296+23+9+9+8+signature(12+592).
    expect(frame.length).toBe(1305);
    expect(() =>
      encodeIrohaConnectApproveFrame({
        sidBytes,
        sequence: 1,
        walletPublicKey: new Uint8Array(32).fill(0x44),
        accountId: 'account',
        permissionsField: Uint8Array.of(7),
        signature: new Uint8Array(64).fill(7),
      })
    ).toThrow();
  });

  it('seals and opens envelopes with direction-separated session keys', () => {
    const sidBytes = new Uint8Array(32).fill(0x11);
    const app = { publicKey: x25519.getPublicKey(new Uint8Array(32).fill(0x01)) };
    const walletPrivateKey = new Uint8Array(32).fill(0x02);
    const keys = deriveIrohaConnectDirectionKeys(walletPrivateKey, app.publicKey, sidBytes);
    expect(Buffer.from(keys.appKey)).not.toEqual(Buffer.from(keys.walletKey));

    const sealed = sealIrohaConnectEnvelope({
      walletKey: keys.walletKey,
      sidBytes,
      sequence: 3,
      payload: { type: 'sign_result_err', code: 'USER_REJECTED', message: 'no' },
    });
    const decoded = decodeIrohaConnectFrame(sealed, { sidBytes });
    expect(decoded).toMatchObject({ kind: 'ciphertext', direction: 'wallet-to-app', sequence: 3 });
    // The wallet only opens app ciphertext, and the wallet key never opens it.
    if (decoded.kind !== 'ciphertext') throw new Error('expected ciphertext');
    expect(() => openIrohaConnectEnvelope(keys.walletKey, sidBytes, decoded)).toThrow('iroha_connect_invalid_frame');
    expect(() =>
      openIrohaConnectEnvelope(keys.appKey, sidBytes, { ...decoded, direction: 'app-to-wallet' })
    ).toThrow('iroha_connect_invalid_frame');
  });

  it('encodes heartbeats as binary control frames', () => {
    const sidBytes = new Uint8Array(32).fill(0x11);
    const ping = encodeIrohaConnectPingFrame({ sidBytes, sequence: 2, nonce: 0xffff_ffff_ffff_fffen });
    expect(ping).toBeInstanceOf(Uint8Array);
    // A wallet-originated ping decodes with the wallet direction and keeps the full u64 nonce.
    expect(decodeIrohaConnectFrame(ping, { sidBytes })).toEqual({
      kind: 'control',
      direction: 'wallet-to-app',
      sequence: 2,
      control: { type: 'ping', nonce: 0xffff_ffff_ffff_fffen },
    });
  });
});
