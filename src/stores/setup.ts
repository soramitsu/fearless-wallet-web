import { createPinia, setActivePinia, type Pinia } from 'pinia';

type AppLike = {
  use: (plugin: unknown) => unknown;
};

const createStoreInstance = (): Pinia => createPinia();

export const installStores = (app: AppLike): Pinia => {
  const pinia = createStoreInstance();

  app.use(pinia);

  return pinia;
};

export const initTestingStores = (): Pinia => {
  const pinia = createStoreInstance();

  setActivePinia(pinia);

  return pinia;
};

export const createTestingStores = initTestingStores;
