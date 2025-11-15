import type { SubmittableExtrinsic } from '@polkadot/api/promise/types';
import type { Api } from '@/sora/api';
import { MstTransfersModule } from '@/sora/mstTransfers';

const APPROVE_RESULT = { section: 'multisig', method: 'approveAsMulti' };

const createWeight = (refTime: number, proofSize: number) => ({
  refTime: {
    toString: () => refTime.toString(),
  },
  proofSize: {
    toString: () => proofSize.toString(),
  },
  toJSON: () => ({ refTime, proofSize }),
});

const extractNumber = (value: unknown): number => {
  if (typeof value === 'object' && value !== null && 'toString' in value) {
    return Number((value as { toString: () => string }).toString());
  }

  if (typeof value === 'string' || typeof value === 'number') {
    return Number(value);
  }

  return 0;
};

const defaultWeight = createWeight(123, 0);

const createModule = ({ hasBlockWeights = true } = {}) => {
  const approveAsMulti = jest.fn(() => APPROVE_RESULT);
  const call = { method: { hash: '0x1234' } } as unknown as SubmittableExtrinsic;
  const registry = {
    createType: jest.fn((_type: string, value: unknown) => {
      if (_type !== 'WeightV2') return value;

      const refTime = extractNumber((value as { refTime?: unknown } | undefined)?.refTime ?? value);
      const proofSize = extractNumber((value as { proofSize?: unknown } | undefined)?.proofSize ?? 0);

      return createWeight(refTime, proofSize);
    }),
  };
  const api = {
    tx: {
      multisig: {
        approveAsMulti,
      },
    },
    createType: jest.fn((type: string, value: string) => {
      if (type !== 'AccountId32') throw new Error(`Unsupported type ${type}`);

      if (typeof value !== 'string' || value.trim() === '') {
        throw new Error('Invalid address');
      }

      return {
        toString: () => value,
      };
    }),
    consts: hasBlockWeights
      ? {
          system: {
            blockWeights: {
              perClass: {
                normal: {
                  maxExtrinsic: defaultWeight,
                },
              },
            },
          },
        }
      : {},
    registry,
  };
  const root = {
    api,
    account: {
      address: '5CallerAccount',
    },
  } as unknown as Api<unknown>;

  const module = new MstTransfersModule(root);

  return { module, approveAsMulti, api, call };
};

describe('MstTransfersModule.prepareExtrinsic', () => {
  it('builds a multisig approval with sorted participants and on-chain weight', () => {
    const { module, approveAsMulti, call } = createModule();
    const coSigners = [
      '5Alice111111111111111111111111111111111111111111111',
      '5Bob2222222222222222222222222222222222222222222222',
    ];

    const result = module.prepareExtrinsic(call, 2, coSigners);
    const [, , , , weightArg] = approveAsMulti.mock.calls[0] as unknown as [
      number,
      string[],
      null,
      string,
      ReturnType<typeof createWeight>,
    ];

    expect(result).toEqual(APPROVE_RESULT);
    expect(weightArg).toBeDefined();
    expect(weightArg.refTime.toString()).toBe('123');
    expect(approveAsMulti).toHaveBeenCalledWith(2, coSigners, null, call.method.hash, weightArg);
  });

  it('throws when the threshold is zero', () => {
    const { module, call } = createModule();

    expect(() => module.prepareExtrinsic(call, 0, ['5Alice'])).toThrow('MST threshold must be greater than zero');
  });

  it('throws when no co-signers are provided', () => {
    const { module, call } = createModule();

    expect(() => module.prepareExtrinsic(call, 1, [])).toThrow('At least one co-signer is required');
  });

  it('throws when the threshold exceeds the participant count', () => {
    const { module, call } = createModule();

    expect(() => module.prepareExtrinsic(call, 3, ['5Alice'])).toThrow(
      'MST threshold cannot be greater than the number of participants (co-signers + you)'
    );
  });

  it('throws when the initiating account is included among the co-signers', () => {
    const { module, call } = createModule();

    expect(() => module.prepareExtrinsic(call, 1, ['5CallerAccount'])).toThrow(
      'Co-signers list must not contain the initiating account'
    );
  });

  it('throws when duplicate co-signers are provided', () => {
    const { module, call } = createModule();

    expect(() =>
      module.prepareExtrinsic(call, 2, [
        '5Alice111111111111111111111111111111111111111111111',
        '5Alice111111111111111111111111111111111111111111111',
      ])
    ).toThrow('Duplicate co-signers are not allowed');
  });

  it('throws when co-signers are not in lexicographical order', () => {
    const { module, call } = createModule();

    expect(() =>
      module.prepareExtrinsic(call, 2, [
        '5Charlie333333333333333333333333333333333333333333333',
        '5Bob2222222222222222222222222222222222222222222222',
      ])
    ).toThrow('Co-signers must be provided in lexicographical order');
  });

  it('throws when block weight constants are unavailable', () => {
    const { module, call } = createModule({ hasBlockWeights: false });
    const coSigners = ['5Alice111111111111111111111111111111111111111111111'];

    expect(() => module.prepareExtrinsic(call, 1, coSigners)).toThrow(
      'Unable to determine multisig weight from runtime metadata. Please refresh the network metadata and try again.'
    );
  });

  it('throws when the initiating account address is invalid', () => {
    const { module, api, call } = createModule();

    api.createType = jest.fn((type: string, value: string) => {
      throw new Error('Bad address');
    });

    expect(() => module.prepareExtrinsic(call, 1, ['5Alice111111111111111111111111111111111111111111111'])).toThrow(
      'Invalid initiating account address provided for multisig approval: 5CallerAccount'
    );
  });

  it('throws when a co-signer address is invalid', () => {
    const { module, api, call } = createModule();

    api.createType = jest.fn((type: string, value: string) => {
      if (value === '5BadSigner') {
        throw new Error('Bad address');
      }

      return {
        toString: () => value,
      };
    });

    expect(() => module.prepareExtrinsic(call, 2, ['5BadSigner', '5CallerAccount'])).toThrow(
      'Invalid multisig signer address provided for multisig approval: 5BadSigner'
    );
  });
});
