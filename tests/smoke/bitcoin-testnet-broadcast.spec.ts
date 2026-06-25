import * as bitcoin from 'bitcoinjs-lib';

import { BitcoinEsploraClient } from '@extension-base/services/bitcoin-indexer-service';
import vectors from '../../docs/universal-wallet-v2-vectors.json';
import { isBitcoinAddress } from '@/util/bitcoin';
import { deriveBitcoinReceiveAddress, getBitcoinReceivePath } from '@/util/bitcoinKeyring';
import { sendBitcoinTransaction, type BitcoinSendError } from '@/util/bitcoinSend';

const mnemonic = vectors.vectors[0].mnemonic;
const sourceAddress = vectors.vectors[0].expected.bitcoin.testnet.firstReceiveAddress;
const recipientAddress = vectors.vectors[1].expected.bitcoin.testnet.firstReceiveAddress;
const sourceDerivationPath = getBitcoinReceivePath('testnet');
const fundedTxid = '11'.repeat(32);
const wrongBroadcastTxid = '22'.repeat(32);

type BitcoinTestnetSmokeConfig = {
  amountSat: number;
  changeAddress?: string;
  derivationPath: string;
  feeRateSatPerVbyte?: number;
  includeUnconfirmed: boolean;
  indexerUrl: string;
  mnemonic: string;
  outpoint: {
    txid: string;
    vout: number;
  };
  recipientAddress: string;
  sourceAddress: string;
};

type SmokeServerOptions = {
  broadcastTxid?: string;
  feeRateSatPerVbyte?: number;
  rejectBroadcast?: boolean;
  utxoValueSat?: number;
};

type SmokeHarness = {
  client: BitcoinEsploraClient;
  requests: string[];
};

describe('Bitcoin testnet broadcast smoke', () => {
  it('dry-runs the full testnet send path through an Esplora-compatible fetch harness', async () => {
    const harness = createSmokeHarness();
    const result = await sendBitcoinTransaction({
      amountSat: 10_000,
      client: harness.client,
      mnemonicOrSeed: mnemonic,
      network: 'testnet',
      selectedOutpoints: [{ txid: fundedTxid, vout: 0 }],
      sources: [{ address: sourceAddress, derivationPath: sourceDerivationPath }],
      toAddress: recipientAddress,
    });

    expect(result.broadcastTxid).toBe(result.txid);
    expect(result.network).toBe('testnet');
    expect(result.sourceAddresses).toEqual([sourceAddress]);
    expect(result.selectedUtxos).toEqual([expect.objectContaining({ txid: fundedTxid, vout: 0 })]);
    expect(harness.requests).toEqual([
      'GET /api/fee-estimates',
      `GET /api/address/${sourceAddress}/utxo`,
      'POST /api/tx',
    ]);
  });

  it('fails closed if the broadcast endpoint returns a mismatched txid', async () => {
    const harness = createSmokeHarness({ broadcastTxid: wrongBroadcastTxid });

    await expect(
      sendBitcoinTransaction({
        amountSat: 10_000,
        client: harness.client,
        feeRateSatPerVbyte: 1,
        mnemonicOrSeed: mnemonic,
        network: 'testnet',
        selectedOutpoints: [{ txid: fundedTxid, vout: 0 }],
        sources: [{ address: sourceAddress, derivationPath: sourceDerivationPath }],
        toAddress: recipientAddress,
      })
    ).rejects.toMatchObject({
      code: 'broadcast_txid_mismatch',
      name: 'BitcoinSendError',
    } satisfies Partial<BitcoinSendError>);
  });

  it('rejects unsafe live-smoke environment before creating a client', () => {
    expect(readLiveSmokeConfig({})).toBeUndefined();
    expect(() => readLiveSmokeConfig({ FEARLESS_BITCOIN_TESTNET_LIVE: 'true' })).toThrow(
      'FEARLESS_BITCOIN_TESTNET_LIVE must be "1"'
    );
    expect(() =>
      readLiveSmokeConfig({
        FEARLESS_BITCOIN_TESTNET_LIVE: '1',
        FEARLESS_BITCOIN_TESTNET_MNEMONIC: mnemonic,
      })
    ).toThrow('Missing FEARLESS_BITCOIN_TESTNET_SOURCE_ADDRESS');
    expect(() =>
      readLiveSmokeConfig({
        ...minimalLiveEnv(),
        FEARLESS_BITCOIN_TESTNET_SOURCE_ADDRESS: vectors.vectors[0].expected.bitcoin.mainnet.firstReceiveAddress,
      })
    ).toThrow('FEARLESS_BITCOIN_TESTNET_SOURCE_ADDRESS must be a Bitcoin testnet address');
    expect(() =>
      readLiveSmokeConfig({
        ...minimalLiveEnv(),
        FEARLESS_BITCOIN_TESTNET_OUTPOINT: `${fundedTxid}:bad`,
      })
    ).toThrow('FEARLESS_BITCOIN_TESTNET_OUTPOINT must be formatted as <txid>:<vout>');
    expect(() =>
      readLiveSmokeConfig({
        ...minimalLiveEnv(),
        FEARLESS_BITCOIN_TESTNET_MNEMONIC: vectors.vectors[1].mnemonic,
      })
    ).toThrow('FEARLESS_BITCOIN_TESTNET_SOURCE_ADDRESS does not match the supplied mnemonic and derivation path');
  });

  const liveConfig = readLiveSmokeConfig(process.env);
  const liveTest = liveConfig ? it : it.skip;

  liveTest(
    'broadcasts a funded transaction on Bitcoin testnet when explicitly enabled',
    async () => {
      if (!liveConfig) throw new Error('live config was unexpectedly unavailable');

      const result = await sendBitcoinTransaction({
        amountSat: liveConfig.amountSat,
        changeAddress: liveConfig.changeAddress,
        client: new BitcoinEsploraClient({ baseUrl: liveConfig.indexerUrl, network: 'testnet' }),
        feeRateSatPerVbyte: liveConfig.feeRateSatPerVbyte,
        includeUnconfirmed: liveConfig.includeUnconfirmed,
        maxInputs: 1,
        mnemonicOrSeed: liveConfig.mnemonic,
        network: 'testnet',
        selectedOutpoints: [liveConfig.outpoint],
        sources: [{ address: liveConfig.sourceAddress, derivationPath: liveConfig.derivationPath }],
        toAddress: liveConfig.recipientAddress,
      });

      expect(result.broadcastTxid).toBe(result.txid);
      expect(result.selectedUtxos).toEqual([expect.objectContaining(liveConfig.outpoint)]);
    },
    60_000
  );
});

function createSmokeHarness({
  broadcastTxid,
  feeRateSatPerVbyte = 1,
  rejectBroadcast = false,
  utxoValueSat = 50_000,
}: SmokeServerOptions = {}): SmokeHarness {
  const requests: string[] = [];
  const fetchFn = vi.fn(async (input: string | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(input.toString());
    const method = init?.method ?? 'GET';
    requests.push(`${method} ${url.pathname}`);

    if (method === 'GET' && url.pathname === '/api/fee-estimates') {
      return jsonResponse({ 1: feeRateSatPerVbyte, 2: feeRateSatPerVbyte });
    }

    if (method === 'GET' && url.pathname === `/api/address/${sourceAddress}/utxo`) {
      return jsonResponse([
        {
          status: {
            block_hash: '33'.repeat(32),
            block_height: 100,
            block_time: 1_700_000_000,
            confirmed: true,
          },
          txid: fundedTxid,
          value: utxoValueSat,
          vout: 0,
        },
      ]);
    }

    if (method === 'POST' && url.pathname === '/api/tx') {
      if (rejectBroadcast) {
        return new Response('rejected', { status: 400 });
      }

      const txHex = await readFetchBody(init?.body);

      return new Response(broadcastTxid ?? bitcoin.Transaction.fromHex(txHex).getId(), {
        headers: { 'content-type': 'text/plain' },
      });
    }

    return jsonResponse({ error: 'not found' }, 404);
  });

  return {
    client: new BitcoinEsploraClient({
      baseUrl: 'https://bitcoin-testnet-smoke.invalid/api',
      fetchFn,
      network: 'testnet',
    }),
    requests,
  };
}

function readLiveSmokeConfig(env: Partial<Record<string, string | undefined>>): BitcoinTestnetSmokeConfig | undefined {
  const enabled = env.FEARLESS_BITCOIN_TESTNET_LIVE;

  if (!enabled) return undefined;
  if (enabled !== '1') throw new Error('FEARLESS_BITCOIN_TESTNET_LIVE must be "1"');

  const mnemonicValue = requiredEnv(env, 'FEARLESS_BITCOIN_TESTNET_MNEMONIC');
  const derivationPath = env.FEARLESS_BITCOIN_TESTNET_DERIVATION_PATH?.trim() || sourceDerivationPath;
  const source = requiredEnv(env, 'FEARLESS_BITCOIN_TESTNET_SOURCE_ADDRESS').toLowerCase();
  const recipient = requiredEnv(env, 'FEARLESS_BITCOIN_TESTNET_RECIPIENT_ADDRESS').toLowerCase();
  const change = env.FEARLESS_BITCOIN_TESTNET_CHANGE_ADDRESS?.trim().toLowerCase();

  if (!isBitcoinAddress(source, 'testnet')) {
    throw new Error('FEARLESS_BITCOIN_TESTNET_SOURCE_ADDRESS must be a Bitcoin testnet address');
  }
  if (!isBitcoinAddress(recipient, 'testnet')) {
    throw new Error('FEARLESS_BITCOIN_TESTNET_RECIPIENT_ADDRESS must be a Bitcoin testnet address');
  }
  if (change && !isBitcoinAddress(change, 'testnet')) {
    throw new Error('FEARLESS_BITCOIN_TESTNET_CHANGE_ADDRESS must be a Bitcoin testnet address');
  }
  if (deriveBitcoinReceiveAddress({ mnemonicOrSeed: mnemonicValue, network: 'testnet', path: derivationPath }) !== source) {
    throw new Error('FEARLESS_BITCOIN_TESTNET_SOURCE_ADDRESS does not match the supplied mnemonic and derivation path');
  }

  return {
    amountSat: parsePositiveInteger(requiredEnv(env, 'FEARLESS_BITCOIN_TESTNET_AMOUNT_SAT'), 'FEARLESS_BITCOIN_TESTNET_AMOUNT_SAT'),
    changeAddress: change,
    derivationPath,
    feeRateSatPerVbyte: optionalPositiveNumber(
      env.FEARLESS_BITCOIN_TESTNET_FEE_RATE_SAT_VBYTE,
      'FEARLESS_BITCOIN_TESTNET_FEE_RATE_SAT_VBYTE'
    ),
    includeUnconfirmed: env.FEARLESS_BITCOIN_TESTNET_INCLUDE_UNCONFIRMED === '1',
    indexerUrl: env.FEARLESS_BITCOIN_TESTNET_INDEXER_URL?.trim() || 'https://blockstream.info/testnet/api',
    mnemonic: mnemonicValue,
    outpoint: parseOutpoint(requiredEnv(env, 'FEARLESS_BITCOIN_TESTNET_OUTPOINT')),
    recipientAddress: recipient,
    sourceAddress: source,
  };
}

function requiredEnv(env: Partial<Record<string, string | undefined>>, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`Missing ${key}`);

  return value;
}

function parseOutpoint(value: string): BitcoinTestnetSmokeConfig['outpoint'] {
  const match = /^([0-9a-f]{64}):(\d+)$/iu.exec(value.trim());
  if (!match) throw new Error('FEARLESS_BITCOIN_TESTNET_OUTPOINT must be formatted as <txid>:<vout>');

  return {
    txid: match[1].toLowerCase(),
    vout: parsePositiveInteger(match[2], 'FEARLESS_BITCOIN_TESTNET_OUTPOINT vout', true),
  };
}

function parsePositiveInteger(value: string, key: string, allowZero = false): number {
  if (!/^\d+$/u.test(value)) throw new Error(`${key} must be a positive integer`);

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || (allowZero ? parsed < 0 : parsed <= 0)) {
    throw new Error(`${key} must be a positive integer`);
  }

  return parsed;
}

function optionalPositiveNumber(value: string | undefined, key: string): number | undefined {
  if (value === undefined || value.trim() === '') return undefined;

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${key} must be a positive number`);

  return parsed;
}

function minimalLiveEnv(): Record<string, string> {
  return {
    FEARLESS_BITCOIN_TESTNET_LIVE: '1',
    FEARLESS_BITCOIN_TESTNET_AMOUNT_SAT: '1000',
    FEARLESS_BITCOIN_TESTNET_MNEMONIC: mnemonic,
    FEARLESS_BITCOIN_TESTNET_OUTPOINT: `${fundedTxid}:0`,
    FEARLESS_BITCOIN_TESTNET_RECIPIENT_ADDRESS: recipientAddress,
    FEARLESS_BITCOIN_TESTNET_SOURCE_ADDRESS: sourceAddress,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status,
  });
}

async function readFetchBody(body: BodyInit | null | undefined): Promise<string> {
  if (typeof body === 'string') return body;
  if (body instanceof URLSearchParams) return body.toString();
  if (body instanceof Blob) return body.text();
  if (body instanceof ArrayBuffer) return new TextDecoder().decode(body);
  if (ArrayBuffer.isView(body)) return new TextDecoder().decode(body);
  if (!body) return '';

  throw new Error('Unsupported Bitcoin smoke request body');
}
