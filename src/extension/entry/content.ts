import { MESSAGE_ORIGIN_CONTENT, MESSAGE_ORIGIN_PAGE, PORT_CONTENT } from '@extension-base/defaults';
import { chrome } from '@polkadot/extension-inject/chrome';
import { eip6963ProviderInfo } from '@extension-base/const';
import type { Message } from '@extension-base/types';

const port = chrome.runtime.connect({ name: PORT_CONTENT });

const onMessage = ({ data, source }: Message): void => {
  if (source !== window || data.origin !== MESSAGE_ORIGIN_PAGE) return;

  port.postMessage(data);
};

port.onMessage.addListener((data): void => {
  window.postMessage({ ...data, origin: MESSAGE_ORIGIN_CONTENT }, '*');
});

window.addEventListener('message', onMessage);

function injectedTextContent() {
  const container = document.head || document.documentElement;
  const placeholderScript = document.createElement('script');
  const script = document.createElement('script');
  const version = process.env.PKG_VERSION as string;
  const walletKey = 'fearlessWallet';

  script.src = chrome.runtime.getURL('page.js');

  placeholderScript.textContent = `class FearlessWalletPlaceholder {
      provider = undefined;
      connected = false;
      isConnected = () => false;
      __waitProvider = (async () => {
        const self = this;
        if (self.provider) {
          return self.provider;
        } else {
          return await new Promise((resolve, reject) => {
            let retry = 0;
            const interval = setInterval(() => {
              if (++retry > 30) {
                clearInterval(interval);
                reject(new Error("SubWallet provider not found"));
              }
              if (self.provider) {
                clearInterval(interval);
                resolve(self.provider);
              }
            }, 100);
          });
        }
      })();

      on() {
        this.__waitProvider.then((provider) => {
          provider.on(...arguments);
        });
      }
      once() {
        this.__waitProvider.then((provider) => {
          provider.once(...arguments);
        });
      }
      off() {
        this.__waitProvider.then((provider) => {
          provider.off(...arguments);
        });
      }
      addListener() {
        this.__waitProvider.then((provider) => {
          provider.addListener(...arguments);
        });
      }
      removeListener() {
        this.__waitProvider.then((provider) => {
          provider.removeListener(...arguments);
        });
      }
      removeAllListeners() {
        this.__waitProvider.then((provider) => {
          provider.removeAllListeners(...arguments);
        });
      }
      async enable() {
        const provider = await this.__waitProvider;
        return await provider.enable(...arguments);
      }
      async request() {
        const provider = await this.__waitProvider;
        return await provider.request(...arguments);
      }
      async send() {
        const provider = await this.__waitProvider;
        return await provider.send(...arguments);
      }
      async sendAsync() {
        const provider = await this.__waitProvider;
        return await provider.sendAsync(...arguments);
      }
    }

    window.injectedWeb3 = window.injectedWeb3 || {};

    if (!window.injectedWeb3['${walletKey}']) {
      window.injectedWeb3['${walletKey}'] = {
        isPlaceholder: true,
        version: '${version}',
        enable: (origin) => {
          const wallet = await  new Promise((resolve, reject) => {
            let retry = 0;
            const interval = setInterval(() => {
              if (++retry > 30) {
                clearInterval(interval);
                reject(new Error("Fearless Wallet provider not found"));
              }
              if (!window.injectedWeb3['${walletKey}'].isPlaceholder) {
                clearInterval(interval);
                resolve();
              }
            }, 100);
          });

          return window.injectedWeb3['${walletKey}'].enable(origin);
        }
      };
    }
    console.log('test')
    window.fearlessWallet = new Proxy(new FearlessWalletPlaceholder(), {
      get(obj, key) {
        if (key === "provider") return undefined;

        const target = obj.provider || obj;

        if (key === 'then') return Promise.resolve(target);

        const proxyTarget = Reflect.get(target, key);

        if (typeof proxyTarget?.bind === 'function') return proxyTarget.bind(target);

        return proxyTarget;
      }
    });

    const announceProvider = () => {
      const detail = Object.freeze({ info: {
        uuid: '${eip6963ProviderInfo.uuid}',
        name: '${eip6963ProviderInfo.name}',
        icon: '${eip6963ProviderInfo.icon}',
        rdns: '${eip6963ProviderInfo.rdns}'
      }, provider: window.fearlessWallet });

      const event = new CustomEvent('eip6963:announceProvider', { detail });

      window.dispatchEvent(event);
    };

    window.addEventListener('eip6963:requestProvider', announceProvider);

    announceProvider();
    `;

  container.insertBefore(script, container.children[0]);
  container.insertBefore(placeholderScript, container.children[0]);
}

injectedTextContent();
