/** @jest-environment node */
// The password change and reset screens used to report success whatever the background answered.
import fs from 'fs';
import path from 'path';
import { runWalletAction } from '../../src/util/walletAction';

const handlers = () => ({ setWaiting: jest.fn(), onSuccess: jest.fn(), onFailure: jest.fn() });

describe('3.0.6: the password change and reset screens report the real outcome', () => {
  it('treats true as success and ends waiting', async () => {
    const outcome = handlers();

    await expect(runWalletAction(async () => true, outcome)).resolves.toBe(true);
    expect(outcome.onSuccess).toHaveBeenCalledTimes(1);
    expect(outcome.onFailure).not.toHaveBeenCalled();
    expect(outcome.setWaiting.mock.calls).toEqual([[true], [false]]);
  });

  it.each([
    ['false', async () => false],
    [
      'a rejection',
      async () => {
        throw new Error('Synthetic port closed');
      },
    ],
    ['no answer', async () => undefined as unknown as boolean],
  ])('treats %s as failure and ends waiting', async (_case, action) => {
    const outcome = handlers();

    await expect(runWalletAction(action, outcome)).resolves.toBe(false);
    expect(outcome.onFailure).toHaveBeenCalledTimes(1);
    expect(outcome.onSuccess).not.toHaveBeenCalled();
    expect(outcome.setWaiting.mock.calls).toEqual([[true], [false]]);
  });

  it.each([
    ['src/screens/welcome/ChangePassword.vue', 'extensionChangePassword'],
    ['src/screens/welcome/ResetWallet.vue', 'resetWallet'],
  ])('%s sends %s through runWalletAction', (file, call) => {
    const source = fs.readFileSync(path.resolve(__dirname, '../..', file), 'utf8');

    expect(source).toMatch(new RegExp(`runWalletAction\\(\\s*(\\(\\) => )?${call}`));
  });
});
