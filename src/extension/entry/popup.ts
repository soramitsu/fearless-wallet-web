import '@polkadot/extension-inject/crossenv';
import createFearlessApp from '@/app/createApp';

const app = createFearlessApp();

app.mount('#app');
