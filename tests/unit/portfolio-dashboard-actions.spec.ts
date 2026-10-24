import type { Readiness } from '@/portfolio/dashboard/readiness';
import { locationActions, type ActionContext } from '@/portfolio/dashboard/actions';

const context = (readiness: Readiness, extra: Partial<ActionContext> = {}): ActionContext => ({
  readiness,
  switchFirst: false,
  canSend: true,
  swapBlockers: [],
  ...extra,
});
const ids = (result: ReturnType<typeof locationActions>) => [result.primary.id, ...result.secondary.map(({ id }) => id)];

describe('location actions', () => {
  it('offer a swap first for a holding that is swap-ready, with Send and Receive beside it', () => {
    const result = locationActions(context({ state: 'ready', hops: [] }));

    expect(ids(result)).toEqual(['swap', 'send', 'receive']);
    expect(result.primary.enabled).toBe(true);
  });

  it('say why a swap cannot open, naming the first thing in the way', () => {
    const result = locationActions(context({ state: 'ready', hops: [] }, { swapBlockers: ['signer', 'assets'] }));

    expect(result.primary).toMatchObject({ id: 'swap', enabled: false, blocked: 'signer' });
  });

  it('offer the first move for a holding with a route, and Send and Receive beside it', () => {
    const result = locationActions(context({ state: 'route', hops: [] }));

    expect(ids(result)).toEqual(['move', 'send', 'receive']);
    expect(result.primary.enabled).toBe(true);
  });

  it('show a paused move as unavailable with its reason, and offer Receive on SORA instead when the route names the asset there', () => {
    const result = locationActions(context({ state: 'off', hops: [], cause: 'moves-off', soraAssetId: 'sora-dot' }));

    expect(result.primary).toMatchObject({ id: 'move', enabled: false, blocked: 'moves-off' });
    expect(result.secondary.map(({ id }) => id)).toEqual(['receiveOnSora', 'send']);
  });

  it('leave Receive on SORA out when no reviewed route names the asset there, and show paused swaps as unavailable', () => {
    expect(ids(locationActions(context({ state: 'off', hops: [], cause: 'moves-off' })))).toEqual(['move', 'send', 'receive']);
    expect(locationActions(context({ state: 'off', hops: [], cause: 'swaps-off' })).primary).toMatchObject({ id: 'swap', enabled: false, blocked: 'swaps-off' });
  });

  it('offer Send and Receive for a token with no route, and for one the app has not finished loading', () => {
    expect(ids(locationActions(context({ state: 'none', hops: [] })))).toEqual(['send', 'receive']);
    expect(ids(locationActions(context({ state: 'unknown', hops: [] })))).toEqual(['send', 'receive']);
  });

  it('say so when a network cannot send, without hiding the action', () => {
    const result = locationActions(context({ state: 'none', hops: [] }, { canSend: false }));

    expect(result.primary).toMatchObject({ id: 'send', enabled: false, blocked: 'send-off' });
  });

  it('mark every action of a holding in another wallet as switching to that wallet first', () => {
    const result = locationActions(context({ state: 'ready', hops: [] }, { switchFirst: true }));

    [result.primary, ...result.secondary].forEach((action) => expect(action.switchFirst).toBe(true));
  });

  it('never offer more than one primary and two secondary actions', () => {
    ['ready', 'route', 'off', 'none', 'unknown'].forEach((state) => {
      const result = locationActions(context({ state, hops: [], soraAssetId: 'x', cause: 'moves-off' } as Readiness));

      expect(result.secondary.length).toBeLessThanOrEqual(2);
    });
  });
});
