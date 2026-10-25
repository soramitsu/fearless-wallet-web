# Records written by 3.0.6

`ton-accounts.json` holds TON account records exactly as the 3.0.6 code (commit `cfcdb591`, branch
`hotfix/3.0.6`) writes them to its `ton` store, starting from the records 3.0.5 wrote
(`../3.0.5/ton-accounts.json`). 3.0.6 rewrites every 3.0.5 record at unlock, so 4.2.0 must read what it wrote:
same address, same public key, same phrase, and the earlier-password recovery of version 3.

| State                            | Master password | Stored as                                                       |
| -------------------------------- | --------------- | --------------------------------------------------------------- |
| `upgradedAtUnlock`               | 3.0.5's         | version 2                                                       |
| `keptForRecovery`                | a later one     | version 3: the 3.0.5 ciphertext, which opens with 3.0.5's       |
| `passwordChanged`                | the next one    | version 2, after a 3.0.6 password change                        |
| `keptForRecoveryPasswordChanged` | the next one    | version 3 moved to the next password; still 3.0.5's inside      |
| `recoveredWithEarlierPassword`   | the later one   | version 2, after 3.0.6's export with the earlier password       |
| `added`                          | the later one   | version 2, the same phrases added to an empty 3.0.6 wallet      |

Each state lists its `masterPassword` and, for version 3, the `earlierPassword` the phrases still open with. The
passwords are test-only and the phrases are the public test phrases of the 3.0.5 fixture; never fund them.

## How it was made

In an unmodified export of the commit (`git archive cfcdb591`), with the dependencies of its `yarn.lock`, Node
20.20.2, this spec was run once with `FIXTURE_OUT=<file> vue-cli-service test:unit --coverage=false`:

```ts
/**
 * @jest-environment node
 */
import fs from 'fs';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { TonKeyringService } from '../../src/extension/background/extension-base/src/services/keyring-service/TonKeyring';
import { tonStore } from '../../src/extension/background/extension-base/src/stores/TonStore';
import fixture from '../fixtures/3.0.5/ton-accounts.json';
import type { TonStoreAccount } from '../../src/extension/background/extension-base/src/stores/TonStore';

jest.mock('../../src/extension/background/extension-base/src/stores/TonStore', () => ({
  tonStore: { readAll: jest.fn(), saveMany: jest.fn(), removeAccount: jest.fn() },
}));

jest.setTimeout(300000);

const CURRENT = 'test-only master password 3.0.6';
const NEXT = 'test-only next master password 3.0.6';
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
let disk: TonStoreAccount[] = [];

async function wallet(records: TonStoreAccount[], password: string) {
  disk = clone(records);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const keyringService: any = { getPassword: () => password };
  const keyring = new TonKeyringService(keyringService);

  keyringService.tonKeyring = keyring;
  await keyring.withStoreLock(async () => undefined);

  return keyring;
}

// What 3.0.6's KeyringService.changeMasterPassword stores: the prepared records in place of the old ones.
async function changePassword(records: TonStoreAccount[], oldPassword: string, newPassword: string) {
  const keyring = await wallet(records, oldPassword);
  const prepared = await keyring.withStoreLock(() => keyring.preparePasswordChange(oldPassword, newPassword));

  return disk.map((record) => prepared.find(({ address }) => address === record.address) ?? record);
}

beforeEach(() => {
  (tonStore.readAll as jest.Mock).mockImplementation(async () => clone(disk));
  (tonStore.saveMany as jest.Mock).mockImplementation(async (records: TonStoreAccount[]) => {
    const next = new Map(disk.map((record) => [record.address, record]));

    records.forEach((record) => next.set(record.address, clone(record)));
    disk = [...next.values()];
  });
  (tonStore.removeAccount as jest.Mock).mockImplementation(async (address: string) => {
    disk = disk.filter((record) => record.address !== address);
  });
});

it('writes TON records with 3.0.6 code', async () => {
  await cryptoWaitReady();

  const written305 = fixture.accounts.map(({ stored }) => stored as TonStoreAccount);
  const states: Record<string, { description: string; masterPassword: string; earlierPassword?: string; records: TonStoreAccount[] }> = {};

  await (await wallet(written305, fixture.password)).migrateOnUnlock(fixture.password);
  states.upgradedAtUnlock = {
    description: 'The 3.0.5 records after the first 3.0.6 unlock with the password they were stored under.',
    masterPassword: fixture.password,
    records: clone(disk),
  };

  await (await wallet(written305, CURRENT)).migrateOnUnlock(CURRENT);
  states.keptForRecovery = {
    description:
      'The 3.0.5 records after the first 3.0.6 unlock with a later master password: 3.0.5 did not re-encrypt TON ' +
      'phrases when the password changed, so they still open only with the earlier one.',
    masterPassword: CURRENT,
    earlierPassword: fixture.password,
    records: clone(disk),
  };

  states.passwordChanged = {
    description: 'upgradedAtUnlock after a 3.0.6 master password change.',
    masterPassword: NEXT,
    records: await changePassword(states.upgradedAtUnlock.records, fixture.password, NEXT),
  };

  states.keptForRecoveryPasswordChanged = {
    description: 'keptForRecovery after a 3.0.6 master password change.',
    masterPassword: NEXT,
    earlierPassword: fixture.password,
    records: await changePassword(states.keptForRecovery.records, CURRENT, NEXT),
  };

  const recovering = await wallet(states.keptForRecovery.records, CURRENT);

  for (const { stored } of fixture.accounts) await recovering.decodeAccountMnemonic(stored.address, fixture.password);
  states.recoveredWithEarlierPassword = {
    description: 'keptForRecovery after exporting each phrase in 3.0.6 with the earlier password.',
    masterPassword: CURRENT,
    records: clone(disk),
  };

  const adding = await wallet([], CURRENT);

  for (const { kind, phrase } of fixture.accounts) await adding.createAccount(phrase, `Added in 3.0.6 ${kind}`, CURRENT);
  states.added = {
    description: 'The same phrases added to an empty wallet in 3.0.6.',
    masterPassword: CURRENT,
    records: clone(disk),
  };

  fs.writeFileSync(process.env.FIXTURE_OUT!, JSON.stringify({ states }, null, 2) + '\n');
});
```

The `source` block was added by hand afterwards;
`states` is the unedited output. `cfcdb591` writes the same formats as `8ee30444`; regenerate this file if a later
3.0.6 commit changes `TonKeyring.ts`.
