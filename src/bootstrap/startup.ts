import { installWebPasswordStorage } from './webPasswordStore';
import en from '@/locales/en/translation.json';
import ru from '@/locales/ru/translation.json';

/** Mount a recovery surface before importing wallet dependencies. Reloading
 * retries from a fresh application instance without duplicating subscriptions. */
export async function startWallet(
  load: () => Promise<{ mountApplication: () => Promise<void> }>,
  prepare: () => Promise<unknown> = () => Promise.resolve(),
  timeoutMs = 20000
): Promise<void> {
  const copy = (navigator.language.startsWith('ru') ? ru : en).ux;
  const surface = document.createElement('section');
  surface.dataset.testid = 'walletStartup';
  surface.setAttribute('role', 'status');
  surface.setAttribute('aria-live', 'polite');
  Object.assign(surface.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '10000',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '16px',
    padding: '24px',
    background: '#191919',
    color: '#fff',
    fontFamily: 'Sora, system-ui, sans-serif',
    textAlign: 'center',
  });
  const title = document.createElement('h1');
  title.textContent = 'Fearless Wallet';
  const message = document.createElement('p');
  message.textContent = copy.startingWallet;
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.textContent = copy.retry;
  retry.hidden = true;
  Object.assign(retry.style, {
    minHeight: '48px',
    padding: '12px 24px',
    border: '2px solid #fff',
    borderRadius: '8px',
    background: '#e6007a',
    color: '#fff',
    font: 'inherit',
    cursor: 'pointer',
  });
  retry.addEventListener('click', () => window.location.reload());
  surface.append(title, message, retry);
  document.body.appendChild(surface);
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      (async () => {
        await prepare();
        const application = await load();
        if (!expired) await application.mountApplication();
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          expired = true;
          reject(new Error('Startup timed out'));
        }, timeoutMs);
      }),
    ]);
    surface.remove();
  } catch (error) {
    console.error('Wallet initialization failed', error);
    expired = true;
    message.textContent = copy.startupUnavailable;
    surface.setAttribute('role', 'alert');
    retry.hidden = false;
    retry.focus();
  } finally {
    clearTimeout(timer);
  }
}

export async function prepareWebWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) throw new Error('Service workers unavailable');
  installWebPasswordStorage();
  const workerUrl = import.meta.env.DEV ? '/src/extension/entry/background-web.ts' : './service-worker.js';
  await navigator.serviceWorker.register(workerUrl, { type: 'module' });
  await navigator.serviceWorker.ready;
}
