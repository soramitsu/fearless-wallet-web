import { BridgeTxStatus, BridgeTxDirection } from '../../src/sora/bridgeProxy/consts';
import { formatRequest, formatApprovedRequest, assertRequest } from '../../src/sora/bridgeProxy/eth/methods';

jest.mock('../../src/sora/assets', () => ({
  toAssetId: jest.fn(),
}));

const { toAssetId: mockToAssetId } = jest.requireMock('../../src/sora/assets') as {
  toAssetId: jest.Mock;
};

mockToAssetId.mockImplementation((payload: unknown) => {
  if (payload && typeof payload === 'object' && 'mockId' in (payload as Record<string, unknown>)) {
    return (payload as { mockId: string }).mockId;
  }

  return 'mock-asset';
});

describe('bridgeProxy eth helpers', () => {
  beforeEach(() => {
    mockToAssetId.mockClear();
  });

  it('formats incoming requests', () => {
    const request = {
      isIncoming: true,
      isLoadIncoming: false,
      isOutgoing: false,
      asIncoming: [
        {
          asTransfer: {
            assetId: { mockId: 'asset-in' },
            amount: {
              toString: () => '123',
              toJSON: () => ({ balance: '123' }),
            },
            author: { toString: () => 'alice' },
            assetKind: { toString: () => 'Sidechain' },
            txHash: { toString: () => 'tx-hash' },
          },
        },
      ],
    } as any;

    const result = formatRequest(request, BridgeTxStatus.Pending);

    expect(result).toEqual(
      expect.objectContaining({
        status: BridgeTxStatus.Pending,
        direction: BridgeTxDirection.Incoming,
        amount: expect.any(String),
        soraAssetAddress: 'asset-in',
        from: 'alice',
        hash: 'tx-hash',
      })
    );
    expect(mockToAssetId).toHaveBeenCalledWith({ mockId: 'asset-in' });
  });

  it('formats outgoing requests', () => {
    const request = {
      isIncoming: false,
      isLoadIncoming: false,
      isOutgoing: true,
      asOutgoing: [
        {
          asTransfer: {
            assetId: { mockId: 'asset-out' },
            amount: {
              toString: () => '456',
              toJSON: () => ({ balance: '456' }),
            },
            from: { toString: () => 'bob' },
            to: { toString: () => '0xabc' },
          },
        },
        { toString: () => 'outgoing-hash' },
      ],
    } as any;

    const result = formatRequest(request, BridgeTxStatus.Done);

    expect(result).toEqual(
      expect.objectContaining({
        status: BridgeTxStatus.Done,
        direction: BridgeTxDirection.Outgoing,
        soraAssetAddress: 'asset-out',
        from: 'bob',
        to: '0xabc',
        hash: 'outgoing-hash',
      })
    );
  });

  it('returns null for unsupported request variants', () => {
    const result = formatRequest(
      {
        isIncoming: false,
        isLoadIncoming: false,
        isOutgoing: false,
      } as any,
      BridgeTxStatus.Pending
    );

    expect(result).toBeNull();
  });

  it('formats approved requests with signatures', () => {
    const request = {
      asTransfer: {
        txHash: { toString: () => 'hash-1' },
        from: { toString: () => 'carol' },
        to: { toString: () => '0xdead' },
        amount: {
          toString: () => '789',
          toJSON: () => ({ balance: '789' }),
        },
        currencyId: { isAssetId: true },
      },
    } as any;

    const proofs = [
      {
        r: { toString: () => 'r' },
        s: { toString: () => 's' },
        v: { toNumber: () => 5 },
      },
    ] as any;

    const result = formatApprovedRequest(request as never, proofs);

    expect(result).toEqual({
      hash: 'hash-1',
      from: 'carol',
      to: '0xdead',
      amount: expect.any(String),
      currencyType: 'AssetId',
      r: ['r'],
      s: ['s'],
      v: [32],
    });
  });

  it('assertRequest throws on bridge errors', () => {
    expect(() =>
      assertRequest(
        {
          isOk: false,
          asOk: [],
          asErr: { toString: () => 'failure' },
        },
        'bridge.test'
      )
    ).toThrow('failure');
  });
});
