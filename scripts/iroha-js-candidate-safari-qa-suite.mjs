// Copyright 2026 Soramitsu Co., Ltd.
// SPDX-License-Identifier: Apache-2.0

import { Buffer } from 'buffer';
import * as address from '@iroha/iroha-js/address';
import * as browser from '@iroha/iroha-js/browser';
import * as transactionCodec from '@iroha/iroha-js/transaction-codec';
import * as normalizers from '@iroha/iroha-js/normalizers';
import * as blake2b from '@iroha/iroha-js/blake2b';
import * as ivmArtifact from '@iroha/iroha-js/ivm-artifact';
import * as instructionBuilders from '@iroha/iroha-js/instruction-builders';
import * as torii from '@iroha/iroha-js/torii';
import * as toriiBrowser from '@iroha/iroha-js/torii-browser';
import * as norito from '@iroha/iroha-js/norito';
import * as offlineCash from '@iroha/iroha-js/offline-cash';
import * as canonicalRequest from '@iroha/iroha-js/canonical-request';
import * as sccp from '@iroha/iroha-js/sccp';
import * as sorafs from '@iroha/iroha-js/sorafs';
import * as crypto from '@iroha/iroha-js/crypto';
import * as connectBrowser from '@iroha/iroha-js/connect-browser';
import * as nexusApp from '@iroha/iroha-js/nexus-app';
import * as kotodamaCompiler from '@iroha/iroha-js/kotodama-compiler';

const EXPECTED_TAR_SHA256 = '15c3eabb845b5fbde419035df9085d3db6ea8fea452d77aa328d73a334ccdea8';
const EXPECTED_INVENTORY_SHA256 = '31b68d1c57fa6c652ceea255c43952bab43ef294358db31d31a4e03573543572';
const EXPECTED_PAYLOAD_HASH_HEX = 'e26ee3e1d0dfd98956e87fecc8261891e8b7a18d6730ab10f64027801fabdcff';
const EXPECTED_FINALIZED_HASH_HEX = '2118871906869497aed5d6bf8365c9c3673b8b11d025993e42734bbd200b9609';
const EXPECTED_CANONICAL_MESSAGE_HEX =
  '504f53540a2f76312f616c69617365732f7265736f6c76650a613d3126613d33267a3d320a643036343033343139353133646138633333323564383963343862613739313836373234383839656531666666356239613037363630646434356632656638340a313730303030303030303132330a3030313132323333343435353636373738383939616162626363646465656666';
const PRIVATE_KEY = Buffer.from('CCF31D85E3B32A4BEA59987CE0C78E3B8E2DB93881468AB2435FE45D5C9DCD53', 'hex');
const DESTINATION_PUBLIC_KEY = Buffer.from('641297079357229F295938A4B5A333DE35069BF47B9D0704E45805713D13C201', 'hex');
const ASSET_DEFINITION = '62Fk4FPcMuLvW5QjDGNF2a4jAmjM';

function exactConfig(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('runtime config must be a plain object');
  }
  const expectedKeys = [
    'schemaVersion',
    'nonce',
    'origin',
    'path',
    'candidateTarSha256',
    'bundleSha256',
    'assertionInventorySha256',
    'reportPrefix',
  ];
  if (JSON.stringify(Object.keys(raw)) !== JSON.stringify(expectedKeys)) {
    throw new Error('runtime config keys are not exact');
  }
  const snapshot = Object.create(null);
  for (const key of expectedKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(raw, key);
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
      throw new Error(`runtime config.${key} must be an enumerable data field`);
    }
    snapshot[key] = descriptor.value;
  }
  if (snapshot.schemaVersion !== 1) throw new Error('unexpected runtime config schema');
  if (!/^[0-9a-f]{64}$/u.test(snapshot.nonce)) throw new Error('invalid runtime nonce');
  if (!/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/u.test(snapshot.origin)) {
    throw new Error('invalid runtime origin');
  }
  if (snapshot.path !== `/qa/${snapshot.nonce}/index.html`) {
    throw new Error('runtime path is not nonce-bound');
  }
  if (snapshot.candidateTarSha256 !== EXPECTED_TAR_SHA256) {
    throw new Error('runtime candidate digest is not pinned');
  }
  if (!/^[0-9a-f]{64}$/u.test(snapshot.bundleSha256)) {
    throw new Error('invalid runtime bundle digest');
  }
  if (snapshot.assertionInventorySha256 !== EXPECTED_INVENTORY_SHA256) {
    throw new Error('runtime assertion inventory is not pinned');
  }
  if (snapshot.reportPrefix !== 'FEARLESS_IROHA_SAFARI_QA_REPORT:') {
    throw new Error('runtime report prefix is not pinned');
  }
  return Object.freeze(snapshot);
}

function bytesEqual(left, right) {
  return Buffer.from(left).equals(Buffer.from(right));
}

function mockResponse(status, body = '', headers = {}) {
  const encoded = new TextEncoder().encode(body);
  const normalizedHeaders = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), String(value)]));
  return {
    status,
    headers: {
      get(name) {
        return normalizedHeaders.get(String(name).toLowerCase()) ?? null;
      },
    },
    async arrayBuffer() {
      return encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength);
    },
  };
}

export async function runSafariCandidateQa({ rawConfig, initialGlobalBufferAbsent }) {
  const config = exactConfig(rawConfig);
  const assertions = [];
  const scenarios = [];
  const record = (id, condition) => {
    const passed = condition === true;
    assertions.push({ id, passed });
    if (!passed) throw new Error(`assertion failed: ${id}`);
  };
  const scenario = async (id, action) => {
    const start = assertions.length;
    await action();
    const count = assertions.length - start;
    scenarios.push({ id, assertions: count, passed: count, failed: 0 });
  };
  const expectCodecError = (id, action, expectedCode) => {
    let observedCode = null;
    try {
      action();
    } catch (error) {
      if (error instanceof transactionCodec.BrowserTransactionCodecError) {
        observedCode = error.code;
      }
    }
    record(id, observedCode === expectedCode);
  };

  let authority;
  let destination;
  let publicKey;
  let payload;
  let payloadHashHex;
  let finalized;

  const sampleInput = (overrides = {}) => ({
    chainId: 'test-chain',
    authority,
    sourceAssetHoldingId: `${ASSET_DEFINITION}#${authority}`,
    quantity: '1.25',
    destinationAccountId: destination,
    metadata: { memo: 'browser', nested: [true, null, { order: 2 }] },
    creationTimeMs: 1_700_000_000_000,
    ttlMs: 5_000,
    nonce: 42,
    ...overrides,
  });

  await scenario('runtime_identity', () => {
    record('runtime.protocol', location.protocol === 'http:');
    record('runtime.hostname', location.hostname === '127.0.0.1');
    record('runtime.origin', location.origin === config.origin);
    record('runtime.pathname_nonce', location.pathname === config.path);
    record('runtime.navigator_vendor', navigator.vendor === 'Apple Computer, Inc.');
    record('runtime.navigator_safari', /Safari\//u.test(navigator.userAgent));
    record('runtime.navigator_not_chromium', !/(?:Chrome|Chromium|CriOS|Edg)\//u.test(navigator.userAgent));
    record('runtime.crypto_subtle', typeof globalThis.crypto?.subtle === 'object');
    record('runtime.text_encoder', typeof TextEncoder === 'function');
    record('runtime.global_buffer_initially_absent', initialGlobalBufferAbsent === true);
  });

  await scenario('package_surface', () => {
    const namespaces = [
      ['surface.address', address],
      ['surface.browser', browser],
      ['surface.transaction_codec', transactionCodec],
      ['surface.normalizers', normalizers],
      ['surface.blake2b', blake2b],
      ['surface.ivm_artifact', ivmArtifact],
      ['surface.instruction_builders', instructionBuilders],
      ['surface.torii', torii],
      ['surface.torii_browser', toriiBrowser],
      ['surface.norito', norito],
      ['surface.offline_cash', offlineCash],
      ['surface.canonical_request', canonicalRequest],
      ['surface.sccp', sccp],
      ['surface.sorafs', sorafs],
      ['surface.crypto', crypto],
      ['surface.connect_browser', connectBrowser],
      ['surface.nexus_app', nexusApp],
      ['surface.kotodama_compiler', kotodamaCompiler],
    ];
    for (const [id, namespace] of namespaces) {
      record(id, namespace !== null && typeof namespace === 'object' && Object.keys(namespace).length > 0);
    }
    record('surface.exact_namespace_count', namespaces.length === 18);
  });

  await scenario('transaction_codec_positive', () => {
    record('codec.api_builder', typeof transactionCodec.buildBrowserTransferPayload === 'function');
    record('codec.api_payload_hash', typeof transactionCodec.browserTransactionPayloadHashHex === 'function');
    record('codec.api_validate', typeof transactionCodec.validateBrowserTransferSignable === 'function');
    record('codec.api_finalize', typeof transactionCodec.finalizeBrowserSignedTransaction === 'function');
    record('codec.api_signed_hash', typeof transactionCodec.browserSignedTransactionHashHex === 'function');

    publicKey = Buffer.from(crypto.publicKeyFromPrivate(PRIVATE_KEY));
    authority = address.AccountAddress.fromAccount({
      algorithm: 'ed25519',
      publicKey,
    }).toI105();
    destination = address.AccountAddress.fromAccount({
      algorithm: 'ed25519',
      publicKey: DESTINATION_PUBLIC_KEY,
    }).toI105();
    record(
      'codec.address_authority',
      typeof authority === 'string' && authority.startsWith('sora') && authority.length > 48
    );
    record(
      'codec.address_destination',
      typeof destination === 'string' &&
        destination.startsWith('sora') &&
        destination.length > 48 &&
        destination !== authority
    );

    payload = transactionCodec.buildBrowserTransferPayload(sampleInput());
    record('codec.payload_nonempty', payload instanceof Uint8Array && payload.byteLength > 128);
    record(
      'codec.payload_deterministic',
      bytesEqual(payload, transactionCodec.buildBrowserTransferPayload(sampleInput()))
    );
    const canonicalA = transactionCodec.buildBrowserTransferPayload(sampleInput({ metadata: { z: 2, a: [1, true] } }));
    const canonicalB = transactionCodec.buildBrowserTransferPayload(sampleInput({ metadata: { a: [1, true], z: 2 } }));
    record('codec.metadata_canonical', bytesEqual(canonicalA, canonicalB));
    payloadHashHex = transactionCodec.browserTransactionPayloadHashHex(payload);
    record('codec.payload_hash_format', /^[0-9a-f]{64}$/u.test(payloadHashHex));
    record('codec.payload_hash_golden', payloadHashHex === EXPECTED_PAYLOAD_HASH_HEX);

    const signable = {
      payloadBytes: payload,
      payloadHashHex,
      authority,
      signingPublicKey: publicKey,
      signatureAlgorithm: 'ed25519',
    };
    const validated = transactionCodec.validateBrowserTransferSignable(signable, {
      authority,
      signingPublicKey: publicKey,
    });
    record('codec.signable_authority', validated.authority === authority);
    record('codec.signable_key', bytesEqual(validated.signingPublicKey, publicKey));
    const signature = Buffer.from(crypto.signEd25519(Buffer.from(payloadHashHex, 'hex'), PRIVATE_KEY));
    record('codec.signature_length', signature.length === 64);
    finalized = transactionCodec.finalizeBrowserSignedTransaction(
      signable,
      { algorithm: 'ed25519', signature },
      publicKey
    );
    record('codec.finalized_version', finalized.signedTransaction[0] === 1);
    record('codec.finalized_hash_format', /^[0-9a-f]{64}$/u.test(finalized.hashHex));
    record(
      'codec.finalized_hash_recomputed',
      transactionCodec.browserSignedTransactionHashHex(finalized.signedTransaction) === finalized.hashHex
    );
    record('codec.finalized_hash_golden', finalized.hashHex === EXPECTED_FINALIZED_HASH_HEX);
    record('codec.global_buffer_after_positive', typeof globalThis.Buffer === 'undefined');
  });

  await scenario('transaction_codec_negative', () => {
    expectCodecError(
      'codec.reject_unknown_field',
      () => transactionCodec.buildBrowserTransferPayload({ ...sampleInput(), unexpected: true }),
      'invalid_input'
    );
    const inherited = Object.create({ inherited: true });
    Object.defineProperties(inherited, Object.getOwnPropertyDescriptors(sampleInput()));
    expectCodecError(
      'codec.reject_inherited_input',
      () => transactionCodec.buildBrowserTransferPayload(inherited),
      'invalid_input'
    );
    expectCodecError(
      'codec.reject_quantity_zero',
      () => transactionCodec.buildBrowserTransferPayload(sampleInput({ quantity: 0 })),
      'invalid_quantity'
    );
    expectCodecError(
      'codec.reject_quantity_leading_zero',
      () => transactionCodec.buildBrowserTransferPayload(sampleInput({ quantity: '01' })),
      'invalid_quantity'
    );
    expectCodecError(
      'codec.reject_quantity_fractional_zero',
      () => transactionCodec.buildBrowserTransferPayload(sampleInput({ quantity: '1.0' })),
      'invalid_quantity'
    );
    expectCodecError(
      'codec.reject_quantity_exponent',
      () => transactionCodec.buildBrowserTransferPayload(sampleInput({ quantity: '1e3' })),
      'invalid_quantity'
    );
    expectCodecError(
      'codec.reject_nonce_zero',
      () => transactionCodec.buildBrowserTransferPayload(sampleInput({ nonce: 0 })),
      'invalid_integer'
    );
    expectCodecError(
      'codec.reject_holding_authority_mismatch',
      () =>
        transactionCodec.buildBrowserTransferPayload(
          sampleInput({ sourceAssetHoldingId: `${ASSET_DEFINITION}#${destination}` })
        ),
      'authority_mismatch'
    );
    const cyclic = {};
    cyclic.self = cyclic;
    expectCodecError(
      'codec.reject_cyclic_metadata',
      () => transactionCodec.buildBrowserTransferPayload(sampleInput({ metadata: cyclic })),
      'invalid_metadata'
    );
    expectCodecError(
      'codec.reject_lone_surrogate',
      () => transactionCodec.buildBrowserTransferPayload(sampleInput({ chainId: 'bad\ud800' })),
      'invalid_input'
    );
    expectCodecError(
      'codec.reject_chain_bound',
      () => transactionCodec.buildBrowserTransferPayload(sampleInput({ chainId: 'x'.repeat(1_025) })),
      'bounds_exceeded'
    );
    expectCodecError(
      'codec.reject_quantity_bound',
      () => transactionCodec.buildBrowserTransferPayload(sampleInput({ quantity: '9'.repeat(200_000) })),
      'bounds_exceeded'
    );

    const signable = {
      payloadBytes: payload,
      payloadHashHex,
      authority,
      signingPublicKey: publicKey,
      signatureAlgorithm: 'ed25519',
    };
    expectCodecError(
      'codec.reject_payload_hash_mismatch',
      () =>
        transactionCodec.validateBrowserTransferSignable({
          ...signable,
          payloadHashHex: '00'.repeat(32),
        }),
      'payload_hash_mismatch'
    );
    expectCodecError(
      'codec.reject_authority_mismatch',
      () => transactionCodec.validateBrowserTransferSignable(signable, { authority: destination }),
      'authority_mismatch'
    );
    expectCodecError(
      'codec.reject_signing_key_mismatch',
      () =>
        transactionCodec.validateBrowserTransferSignable(signable, {
          signingPublicKey: DESTINATION_PUBLIC_KEY,
        }),
      'authority_mismatch'
    );
    const validSignature = Buffer.from(crypto.signEd25519(Buffer.from(payloadHashHex, 'hex'), PRIVATE_KEY));
    const tamperedSignature = Buffer.from(validSignature);
    tamperedSignature[0] ^= 0x01;
    expectCodecError(
      'codec.reject_signature_tamper',
      () => transactionCodec.finalizeBrowserSignedTransaction(signable, tamperedSignature, publicKey),
      'invalid_signature'
    );

    let proxyGets = 0;
    const proxiedInput = new Proxy(sampleInput(), {
      get(target, property, receiver) {
        proxyGets += 1;
        return Reflect.get(target, property, receiver);
      },
    });
    const proxiedPayload = transactionCodec.buildBrowserTransferPayload(proxiedInput);
    record('codec.proxy_get_trap_not_invoked', proxyGets === 0 && bytesEqual(proxiedPayload, payload));

    let accessorReads = 0;
    const accessorMetadata = {};
    Object.defineProperty(accessorMetadata, 'secret', {
      enumerable: true,
      get() {
        accessorReads += 1;
        return 'should-not-run';
      },
    });
    let accessorRejected = false;
    try {
      transactionCodec.buildBrowserTransferPayload(sampleInput({ metadata: accessorMetadata }));
    } catch (error) {
      accessorRejected =
        error instanceof transactionCodec.BrowserTransactionCodecError && error.code === 'invalid_input';
    }
    record('codec.accessor_not_invoked', accessorRejected && accessorReads === 0);
  });

  await scenario('canonical_request', async () => {
    const query = canonicalRequest.canonicalQueryString('z=2&a=3&a=1');
    record('canonical.query_order', query === 'a=1&a=3&z=2');
    const body = '{"alias":"tidal-river-4160@mibank.paynet"}';
    const timestampMs = 1_700_000_000_123;
    const nonce = '00112233445566778899aabbccddeeff';
    const message = canonicalRequest.canonicalRequestSignatureMessage({
      method: 'post',
      path: '/v1/aliases/resolve',
      query,
      body,
      timestampMs,
      nonce,
    });
    record('canonical.message_type', message instanceof Uint8Array && message.byteLength > 64);
    record('canonical.message_golden', Buffer.from(message).toString('hex') === EXPECTED_CANONICAL_MESSAGE_HEX);
    const request = await canonicalRequest.buildCanonicalJsonRequest({
      accountId: authority,
      method: 'post',
      path: '/v1/aliases/resolve',
      query,
      body: { alias: 'tidal-river-4160@mibank.paynet' },
      privateKey: PRIVATE_KEY,
      timestampMs,
      nonce,
    });
    record('canonical.json_method', request.method === 'POST');
    record('canonical.json_body', request.body === body);
    record('canonical.account_header', request.headers['X-Iroha-Account'] === authority);
    record('canonical.nonce_header', request.headers['X-Iroha-Nonce'] === nonce);
    record('canonical.timestamp_header', request.headers['X-Iroha-Timestamp-Ms'] === String(timestampMs));
    const signedMessage = canonicalRequest.canonicalRequestSignatureMessage({
      method: request.method,
      path: '/v1/aliases/resolve',
      query,
      body: request.body,
      timestampMs,
      nonce,
    });
    record(
      'canonical.signature_valid',
      crypto.verifyEd25519(signedMessage, Buffer.from(request.headers['X-Iroha-Signature'], 'base64'), publicKey) ===
        true
    );
    record('canonical.global_buffer_after_request', typeof globalThis.Buffer === 'undefined');
  });

  await scenario('nexus_browser', async () => {
    record('nexus.hash_matches_codec', nexusApp.nexusPayloadHashHex(payload) === payloadHashHex);
    for (const [id, url] of [
      ['nexus.reject_url_scheme', 'ftp://torii.example'],
      ['nexus.reject_url_credentials', 'https://user:secret@torii.example'],
      ['nexus.reject_url_query', 'https://torii.example?target=evil'],
      ['nexus.reject_url_fragment', 'https://torii.example/#fragment'],
    ]) {
      let rejected = false;
      try {
        new nexusApp.NexusAppClient({ toriiBaseUrl: url, fetchImpl() {} });
      } catch {
        rejected = true;
      }
      record(id, rejected);
    }

    const calls = [];
    const responseHash = 'ab'.repeat(32);
    const client = new nexusApp.NexusAppClient({
      toriiBaseUrl: 'https://torii.example/gateway/v1/',
      async fetchImpl(url, init) {
        calls.push({
          url,
          method: init.method,
          contentType: init.headers['Content-Type'],
          credentials: init.credentials,
          redirect: init.redirect,
          referrerPolicy: init.referrerPolicy,
          body: Buffer.from(init.body),
        });
        return mockResponse(202, JSON.stringify({ hashHex: responseHash }), {
          'content-type': 'application/json',
        });
      },
    });
    const signed = Uint8Array.from([1, 2, 3, 4]);
    const response = await client.toriiClient.submitTransaction(signed);
    record(
      'nexus.submit_url',
      calls.length === 1 && calls[0].url === 'https://torii.example/gateway/v1/pipeline/transactions'
    );
    record('nexus.submit_method', calls[0].method === 'POST');
    record('nexus.submit_content_type', calls[0].contentType === 'application/x-norito');
    record('nexus.submit_credentials', calls[0].credentials === 'omit');
    record('nexus.submit_redirect', calls[0].redirect === 'error');
    record('nexus.submit_referrer', calls[0].referrerPolicy === 'no-referrer');
    record('nexus.submit_body', bytesEqual(calls[0].body, Uint8Array.from([1, 2, 3, 4])));
    record('nexus.response_hash', response.hashHex === responseHash);
    record('nexus.global_buffer_after_submit', typeof globalThis.Buffer === 'undefined');
  });

  return {
    schemaVersion: 1,
    kind: 'fearless-iroha-js-candidate-safari-qa',
    status: 'passed',
    nonce: config.nonce,
    origin: config.origin,
    candidateTarSha256: config.candidateTarSha256,
    bundleSha256: config.bundleSha256,
    packageName: '@iroha/iroha-js',
    packageVersion: '0.0.3',
    assertionInventorySha256: config.assertionInventorySha256,
    navigator: {
      vendor: navigator.vendor,
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
    },
    scenarios,
    assertions,
  };
}
