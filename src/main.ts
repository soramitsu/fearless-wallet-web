import createFearlessApp from '@/app/createApp';
import { IS_EXTENSION } from '@/consts/global';

const app = createFearlessApp();

if ('serviceWorker' in navigator && !IS_EXTENSION) {
  window.addEventListener('load', () => {
    const serviceWorker = (navigator as Navigator & { serviceWorker?: ServiceWorkerContainer }).serviceWorker;

    if (!serviceWorker) return;

    serviceWorker
      .register('service-worker.js')
      .then((registration: ServiceWorkerRegistration) => console.info('SW registered: ', registration))
      .catch((registrationError: unknown) => console.info('SW registration failed: ', registrationError));
  });
}

app.mount('#app');
