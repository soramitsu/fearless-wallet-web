import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { getRounds, hashSync } from 'bcryptjs';

const fixture = vi.hoisted(() => ({
  data: {} as Record<string, unknown>,
  writes: [] as string[][],
  runtime: { lastError: undefined as { message: string } | undefined },
}));
const bcrypt = vi.hoisted(() => ({ compares: 0 }));
vi.mock('bcryptjs', async (original) => {
  const actual = await original<typeof import('bcryptjs')>();
  return { ...actual, compareSync: (password: string, hash: string) => { bcrypt.compares += 1; return actual.compareSync(password, hash); } };
});
vi.mock('@/consts/global', async (original) => ({ ...(await original<Record<string, unknown>>()), IS_EXTENSION: true }));
vi.mock('@subwallet/ui-keyring', () => ({ keyring: { keyring: { setupMasterPassword: vi.fn() } } }));
vi.mock('@extension-base/utils/crossenv', () => ({ chrome: {
  runtime: fixture.runtime,
  storage: { local: {
    get: (keys: string[] | null, callback: (data: Record<string, unknown>) => void) =>
      callback(structuredClone(keys ? Object.fromEntries(keys.filter((key) => key in fixture.data).map((key) => [key, fixture.data[key]])) : fixture.data)),
    set: (data: Record<string, unknown>, callback: () => void) => {
      fixture.writes.push(Object.keys(data));
      Object.assign(fixture.data, structuredClone(data));
      callback();
    },
  } },
} }));

import { PASSWORD_VERIFIER_COST, upgradePasswordVerifier } from '@extension-base/services/keyring-service/PasswordVerifier';

// Public test password only.
const PASSWORD = 'Public verifier test password';
let current: string;
let legacy: string;

beforeAll(() => {
  current = hashSync(PASSWORD, PASSWORD_VERIFIER_COST);
  legacy = hashSync(PASSWORD, 6);
});
beforeEach(() => {
  fixture.data = {};
  fixture.writes = [];
  bcrypt.compares = 0;
});

it('accepts a verifier already at full cost without a second bcrypt or a write', async () => {
  fixture.data['fw:keyring'] = { passwordHash: current };

  await upgradePasswordVerifier(PASSWORD, () => undefined);

  expect(bcrypt.compares).toBe(0);
  expect(fixture.writes).toEqual([]);
});

it('checks the password against a weaker verifier before writing its stronger hash', async () => {
  fixture.data['fw:keyring'] = { passwordHash: legacy };

  await upgradePasswordVerifier(PASSWORD, () => undefined);

  expect(bcrypt.compares).toBe(1);
  expect(fixture.writes).toEqual([['fw:keyring']]);
  expect(getRounds((fixture.data['fw:keyring'] as { passwordHash: string }).passwordHash)).toBe(PASSWORD_VERIFIER_COST);
});

it.each([
  ['a weaker verifier of another password', () => hashSync('Public other password', 6)],
  ['a malformed verifier', () => 'not a bcrypt hash'],
])('refuses %s without writing', async (_name, stored) => {
  fixture.data['fw:keyring'] = { passwordHash: stored() };

  await expect(upgradePasswordVerifier(PASSWORD, () => undefined)).rejects.toThrow('Wallet password changed');
  expect(fixture.writes).toEqual([]);
});
