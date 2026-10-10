import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  IROHA_CONNECT_UNAVAILABLE,
  requireEnabledIrohaConnect,
  subscribeIrohaConnectState,
} from '@extension-base/services/iroha-connect-service/releaseGate';
import { EMPTY_IROHA_CONNECT_SNAPSHOT } from '@extension-base/services/iroha-connect-service/types';
import type { NavigationGuardNext, RouteLocationNormalized } from 'vue-router';
import type State from '@extension-base/background/handlers/State';
import { createIrohaConnectRouteGuard, IROHA_CONNECT_UNAVAILABLE_NOTICE } from '@/router/irohaConnectGate';

const originalFlag = process.env.VUE_APP_ENABLE_IROHA_CONNECT;

const ACTION_MESSAGES = {
  'pri(irohaConnect.connect)': 'connect',
  'pri(irohaConnect.session.approve)': 'approveSession',
  'pri(irohaConnect.session.reject)': 'rejectSession',
  'pri(irohaConnect.request.approve)': 'approveRequest',
  'pri(irohaConnect.request.reject)': 'rejectRequest',
  'pri(irohaConnect.disconnect)': 'disconnect',
  'pri(irohaConnect.error.clear)': 'clearError',
} as const;

function createState() {
  const irohaConnectService = {
    approveRequest: vi.fn(),
    approveSession: vi.fn(),
    clearError: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    rejectRequest: vi.fn(),
    rejectSession: vi.fn(),
    snapshot: { ...EMPTY_IROHA_CONNECT_SNAPSHOT, phase: 'connected' },
    stateSubject: { subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })) },
  };
  const subscriptionService = {
    cancelSubscription: vi.fn(),
    createSubscription: vi.fn(() => vi.fn()),
    setUnsubscriptionHandle: vi.fn(),
  };

  return {
    irohaConnectService,
    subscriptionService,
    state: { irohaConnectService, subscriptionService } as unknown as Pick<
      State,
      'irohaConnectService' | 'subscriptionService'
    >,
  };
}

describe('IrohaConnect release gate', () => {
  beforeEach(() => {
    delete process.env.VUE_APP_ENABLE_IROHA_CONNECT;
  });

  afterEach(() => {
    if (originalFlag === undefined) delete process.env.VUE_APP_ENABLE_IROHA_CONNECT;
    else process.env.VUE_APP_ENABLE_IROHA_CONNECT = originalFlag;
  });

  it('refuses every action before the service is reachable while compiled off', () => {
    const { irohaConnectService } = createState();

    expect(() => requireEnabledIrohaConnect(irohaConnectService)).toThrow(IROHA_CONNECT_UNAVAILABLE);
    expect(IROHA_CONNECT_UNAVAILABLE).toBe('IrohaConnect is not available in this version.');
    Object.values(ACTION_MESSAGES).forEach((method) => expect(irohaConnectService[method]).not.toHaveBeenCalled());
  });

  it('hands the service back when the reviewed flag enables it', () => {
    process.env.VUE_APP_ENABLE_IROHA_CONNECT = 'true';
    const { irohaConnectService } = createState();

    expect(requireEnabledIrohaConnect(irohaConnectService)).toBe(irohaConnectService);
  });

  it('reports the idle snapshot without subscribing while compiled off', () => {
    const { irohaConnectService, state, subscriptionService } = createState();

    expect(subscribeIrohaConnectState(state, 'fixture-id')).toEqual(EMPTY_IROHA_CONNECT_SNAPSHOT);
    expect(subscriptionService.createSubscription).not.toHaveBeenCalled();
    expect(irohaConnectService.stateSubject.subscribe).not.toHaveBeenCalled();
  });

  it('subscribes and cleans up on disconnect when the reviewed flag enables it', () => {
    process.env.VUE_APP_ENABLE_IROHA_CONNECT = 'true';
    const { irohaConnectService, state, subscriptionService } = createState();
    let disconnect: () => void = () => undefined;
    const port = { onDisconnect: { addListener: (listener: () => void) => (disconnect = listener) } };

    expect(subscribeIrohaConnectState(state, 'fixture-id', port as never)).toMatchObject({ phase: 'connected' });
    expect(subscriptionService.createSubscription).toHaveBeenCalledWith('fixture-id', port);
    expect(irohaConnectService.stateSubject.subscribe).toHaveBeenCalledOnce();

    disconnect();
    expect(subscriptionService.cancelSubscription).toHaveBeenCalledWith('fixture-id');
  });

  it('routes every background IrohaConnect action through the release gate', () => {
    const source = readFileSync(
      resolve(__dirname, '../../src/extension/background/extension-base/src/background/handlers/Extension.ts'),
      'utf8'
    );

    Object.entries(ACTION_MESSAGES).forEach(([message, method]) => {
      const start = source.indexOf(`case '${message}':`);
      const body = source.slice(start, source.indexOf('case ', start + message.length + 7));

      expect(start).toBeGreaterThan(-1);
      expect(body).toContain(`return this.enabledIrohaConnectService.${method}(`);
    });
    expect(source).toContain('return requireEnabledIrohaConnect(this.state.irohaConnectService);');
    expect(source).toContain('return subscribeIrohaConnectState(this.state, id, port);');
    expect(source.match(/this\.state\.irohaConnectService\./gu)).toBeNull();
  });

  it('sends a stale IrohaConnect route to Settings with a nothing-was-signed notice', () => {
    const next = vi.fn() as unknown as NavigationGuardNext;
    const guard = createIrohaConnectRouteGuard('Settings');
    const route = { path: '/fearless/settings/iroha-connect' } as RouteLocationNormalized;

    guard.call(undefined, route, route, next);
    expect(next).toHaveBeenCalledWith({ name: 'Settings', query: { notice: IROHA_CONNECT_UNAVAILABLE_NOTICE } });

    process.env.VUE_APP_ENABLE_IROHA_CONNECT = 'true';
    vi.mocked(next).mockClear();
    guard.call(undefined, route, route, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('keeps the guard on the IrohaConnect route', () => {
    const routes = readFileSync(resolve(__dirname, '../../src/router/routes.ts'), 'utf8');
    const start = routes.indexOf("path: 'settings/iroha-connect'");

    expect(routes.slice(start, routes.indexOf('\n      },', start))).toContain(
      'beforeEnter: createIrohaConnectRouteGuard(Components.Settings)'
    );
  });
});
