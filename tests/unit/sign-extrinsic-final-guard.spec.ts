import { signExtrinsic } from '@extension-base/api/substrate/shared/signExtrinsic';
import type State from '@extension-base/background/handlers/State';
import type { ApiProps } from '@extension-base/background/types/types';
import type { SubmittableExtrinsic } from '@polkadot/api/types';

vi.mock('@extension-base/signers/KeyringSigner', () => ({
  default: class {
    constructor(readonly options: unknown) {}
  },
}));

const ADDRESS = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
const CHAIN_ID = 'e143f23803ac50e8f6f8e62695d1ce9e4e1d68aa36c1cd2cfd15340213f3423e';

function setup(finalGuard: () => void) {
  const order: string[] = [];
  const api = {
    genesisHash: { toHex: () => `0x${CHAIN_ID}` },
    registry: {},
    rpc: {
      system: {
        accountNextIndex: vi.fn(async () => {
          order.push('nonce');

          return 7;
        }),
      },
    },
  };
  const extrinsic = {
    registry: api.registry,
    signAsync: vi.fn(async () => {
      order.push('sign');
    }),
  };
  const state = { keyringService: { getPair: () => ({ meta: {} }) } } as unknown as State;
  const run = () =>
    signExtrinsic(
      {
        address: ADDRESS,
        apiProps: { api } as unknown as ApiProps,
        chainId: CHAIN_ID,
        extrinsic: extrinsic as unknown as SubmittableExtrinsic<'promise'>,
        isMobile: false,
        finalGuard: () => {
          order.push('guard');
          finalGuard();
        },
      },
      state
    );

  return { extrinsic, order, run };
}

describe('signing boundary', () => {
  it('runs the final guard after reading the nonce and immediately before signing with it', async () => {
    const { extrinsic, order, run } = setup(() => undefined);

    await run();

    expect(order).toEqual(['guard', 'nonce', 'guard', 'sign', 'guard']);
    expect(extrinsic.signAsync).toHaveBeenCalledWith(ADDRESS, { signer: expect.anything(), nonce: 7 });
  });

  it('never signs when the final guard fails', async () => {
    const { extrinsic, run } = setup(() => {
      throw new Error('cross_chain_fee_changed');
    });

    await expect(run()).rejects.toThrow('cross_chain_fee_changed');
    expect(extrinsic.signAsync).not.toHaveBeenCalled();
  });
});
