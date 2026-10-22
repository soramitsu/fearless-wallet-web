import { writeFileSync } from 'node:fs';

import { makeIrohaTransfer, type IrohaTransferCodec } from '@extension-base/api/iroha/transfer';
import {
  browserIrohaTransferCodec,
  getIrohaTransferFrameBytes,
} from '@extension-base/api/iroha/productionTransferCodec';
import { IrohaToriiWalletClient } from '@extension-base/services/iroha-torii-service';
import type State from '@extension-base/background/handlers/State';
import type { NetworkJson } from '@extension-base/types';
import { UNIVERSAL_WALLET_IROHA_NETWORKS } from '@/consts/universalWallet';
import { WalletEcosystem } from '@/interfaces';
import { isIrohaI105Address } from '@/util/iroha';
import { deriveIrohaAddress } from '@/util/irohaKeyring';
import { addIrohaQuantities } from '@/util/irohaQuantity';

const TAIRA = UNIVERSAL_WALLET_IROHA_NETWORKS.taira;
const XOR = TAIRA.nativeAsset.id;

type TairaLiveConfig = {
  amount: string;
  evidenceOut?: string;
  mnemonic: string;
  recipient: string;
  source: string;
};

describe('Taira transfer smoke', () => {
  it('rejects unsafe live-smoke environment before touching the network', () => {
    expect(readLiveConfig({})).toBeUndefined();
    expect(() => readLiveConfig({ FEARLESS_TAIRA_LIVE: 'true' })).toThrow('FEARLESS_TAIRA_LIVE must be "1"');
    expect(() => readLiveConfig({ FEARLESS_TAIRA_LIVE: '1' })).toThrow('Missing FEARLESS_TAIRA_MNEMONIC');
  });

  // `process` is the browser polyfill inside transformed modules; the opt-in lives in the real Node env.
  const liveConfig = readLiveConfig((globalThis as { process?: { env?: Record<string, string> } }).process?.env ?? {});
  const liveTest = liveConfig ? it : it.skip;

  liveTest(
    'sends XOR on live Taira through the extension transfer path',
    async () => {
      if (!liveConfig) throw new Error('live config was unexpectedly unavailable');

      const previousFlag = process.env.VUE_APP_ENABLE_IROHA_TRANSFERS;
      const client = new IrohaToriiWalletClient({ baseUrl: TAIRA.toriiBaseUrl, network: 'taira' });
      const balanceOf = async (account: string) => {
        const { body } = await client.getAccountAssets<{ asset: string; quantity: string }>(account);

        return body.items.find(({ asset }) => asset === XOR)?.quantity ?? '0';
      };
      const before = { recipient: await balanceOf(liveConfig.recipient), source: await balanceOf(liveConfig.source) };
      const signed: string[] = [];
      const codec: IrohaTransferCodec = {
        async buildAndSignTransfer(input) {
          const result = await browserIrohaTransferCodec.buildAndSignTransfer(input);

          signed.push(result.signedTransactionHashHex);

          return result;
        },
      };
      const callback = vi.fn();

      process.env.VUE_APP_ENABLE_IROHA_TRANSFERS = 'true';
      try {
        await makeIrohaTransfer(
          {
            amount: liveConfig.amount,
            assetId: XOR,
            callback,
            from: liveConfig.source,
            networkKey: 'Taira',
            state: createState(liveConfig),
            to: liveConfig.recipient,
          },
          codec,
          getIrohaTransferFrameBytes,
          client
        );
      } finally {
        if (previousFlag === undefined) delete process.env.VUE_APP_ENABLE_IROHA_TRANSFERS;
        else process.env.VUE_APP_ENABLE_IROHA_TRANSFERS = previousFlag;
      }

      const [hash] = signed;
      const status = await client.getTransactionStatus(hash);
      const after = { recipient: await balanceOf(liveConfig.recipient), source: await balanceOf(liveConfig.source) };
      const fee = subtract(subtract(before.source, after.source), liveConfig.amount);

      expect(callback).toHaveBeenCalledWith({ status: true });
      expect(status).toMatchObject({ resolved_from: 'state', status: { kind: 'Applied' } });
      expect(after.recipient).toBe(addIrohaQuantities(before.recipient, liveConfig.amount));
      expect(fee).toBe('0.01');

      if (liveConfig.evidenceOut) {
        writeFileSync(
          liveConfig.evidenceOut,
          `${JSON.stringify(
            {
              amount: liveConfig.amount,
              assetDefinitionId: XOR,
              blockHeight: status?.status.block_height ?? null,
              fee,
              network: 'taira',
              networkId: TAIRA.networkId,
              recipient: liveConfig.recipient,
              recordedAt: new Date().toISOString(),
              source: liveConfig.source,
              transactionHash: hash,
            },
            null,
            2
          )}\n`
        );
      }
    },
    180_000
  );
});

function createState(config: TairaLiveConfig): State {
  const network = {
    active: true,
    assets: [],
    chainDiscriminant: TAIRA.chainDiscriminant,
    chainId: TAIRA.chainId,
    currentProvider: '',
    ecosystem: 'iroha',
    key: 'Taira',
    name: 'Taira',
    nodes: [{ name: 'taira-testnet-torii', url: TAIRA.toriiBaseUrl }],
    providers: {},
  } as unknown as NetworkJson;

  return {
    balanceService: { fetchBalance: async () => [] },
    keyringService: {
      exportMnemonic: () => ({ seed: config.mnemonic }),
      getAllAccounts: () => [
        { address: 'smoke-account', meta: { irohaAddress: config.source, walletEcosystem: WalletEcosystem.Iroha } },
      ],
    },
    networkService: { networkMap: { Taira: network } },
  } as unknown as State;
}

function readLiveConfig(env: Partial<Record<string, string | undefined>>): TairaLiveConfig | undefined {
  const enabled = env.FEARLESS_TAIRA_LIVE;

  if (!enabled) return undefined;
  if (enabled !== '1') throw new Error('FEARLESS_TAIRA_LIVE must be "1"');

  const mnemonic = required(env, 'FEARLESS_TAIRA_MNEMONIC');
  const recipient = required(env, 'FEARLESS_TAIRA_RECIPIENT');
  const amount = env.FEARLESS_TAIRA_AMOUNT?.trim() || '0.5';
  const source = deriveIrohaAddress({ mnemonic, network: 'taira' }).address;

  if (!isIrohaI105Address(recipient, 'taira')) throw new Error('FEARLESS_TAIRA_RECIPIENT must be a Taira I105 account');
  if (recipient === source) throw new Error('FEARLESS_TAIRA_RECIPIENT must differ from the source account');

  return { amount, evidenceOut: env.FEARLESS_TAIRA_EVIDENCE_OUT?.trim() || undefined, mnemonic, recipient, source };
}

function required(env: Partial<Record<string, string | undefined>>, key: string): string {
  const value = env[key]?.trim();

  if (!value) throw new Error(`Missing ${key}`);

  return value;
}

function subtract(left: string, right: string): string {
  const scale = Math.max(left.split('.')[1]?.length ?? 0, right.split('.')[1]?.length ?? 0);
  const toUnits = (value: string) => {
    const [whole, fraction = ''] = value.split('.');

    return BigInt(`${whole}${fraction.padEnd(scale, '0')}`);
  };
  const difference = toUnits(left) - toUnits(right);
  const negative = difference < 0n;
  const digits = (negative ? -difference : difference).toString().padStart(scale + 1, '0');
  const value = scale ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}`.replace(/\.?0+$/u, '') : digits;

  return negative ? `-${value}` : value;
}
