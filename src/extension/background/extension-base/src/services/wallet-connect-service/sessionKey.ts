import { chrome } from '@extension-base/utils/crossenv';
import { IS_EXTENSION } from '@/consts/global';

const name = 'fearless:walletconnect:record-key';

async function trustedArea() {
  const area = IS_EXTENSION ? chrome?.storage?.session : undefined;
  if (!area?.setAccessLevel) return undefined;
  await area.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  return area;
}

export async function readSessionKey(): Promise<string | undefined> {
  const area = await trustedArea();
  const value = area && (await area.get(name))[name];
  return typeof value === 'string' ? value : undefined;
}

export async function saveSessionKey(exportKey: () => string) {
  const area = await trustedArea();
  if (area) await area.set({ [name]: exportKey() });
}

export async function clearSessionKey() {
  if (IS_EXTENSION) await chrome?.storage?.session?.remove(name);
}
