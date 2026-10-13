import { EXTENSION_PREFIX } from '../defaults';
import BaseWebStore from './BaseWeb';
import { requestWebPasswordStorage } from '@/bootstrap/webPasswordStore';

// localStorage and IndexedDB cannot commit together. Before removing the web
// password record, retain it in IndexedDB. The account reset transaction removes
// this journal only on commit. Startup repairs an interrupted reset before load.
export const WEB_RESET_PASSWORD_KEY = 'pendingResetPassword';
class ResetPasswordStore extends BaseWebStore<{ serialized: string | null }> {}

export async function retainWebResetPassword(): Promise<void> {
  await recoverWebResetPassword();
  const serialized = await requestWebPasswordStorage('get');
  const store = new ResetPasswordStore(EXTENSION_PREFIX);
  await store.replaceAndWait({ [WEB_RESET_PASSWORD_KEY]: { serialized } }, [], false);
}

export async function recoverWebResetPassword(): Promise<void> {
  const store = new ResetPasswordStore(EXTENSION_PREFIX);
  const backup = await store.getAndWait(WEB_RESET_PASSWORD_KEY);
  if (!backup) return;
  if (typeof backup.serialized !== 'string' && backup.serialized !== null)
    throw new Error('Invalid pending password reset recovery.');
  const current = await requestWebPasswordStorage('get');
  // A later successful password write always wins over this recovery copy.
  if (!current && backup.serialized) await requestWebPasswordStorage('set', backup.serialized);
  await store.replaceAndWait({}, [WEB_RESET_PASSWORD_KEY], false);
}
