import * as runtime from './backgroundRuntime';
import { registerBackgroundListeners } from './backgroundBootstrap';

// This entry is built separately, with the runtime import external. The runtime's
// transformed WASM readiness must not defer registration of MV3 wake listeners.
const ready = Promise.resolve((runtime as typeof runtime & { __tla?: Promise<void> }).__tla)
  .then(() => runtime.backgroundReady);

registerBackgroundListeners((globalThis.browser ?? globalThis.chrome) as typeof chrome, ready);
