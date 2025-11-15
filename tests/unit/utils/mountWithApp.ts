import { mount, type MountingOptions, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { i18n } from '@/locales';
import installSoramitsuUI, { type SoramitsuApp } from '@/plugins/soramitsuUI';

type MountWithAppOptions = MountingOptions<unknown> & {
  pinia?: Pinia;
};

const soramitsuPlugin = {
  install(app: SoramitsuApp) {
    installSoramitsuUI(app);
  },
};

export const mountWithApp = (component: unknown, options: MountWithAppOptions = {}): VueWrapper<unknown> => {
  const pinia = options.pinia ?? createPinia();

  setActivePinia(pinia);

  const global = {
    ...options.global,
    plugins: [...(options.global?.plugins ?? []), pinia, i18n, soramitsuPlugin],
    stubs: {
      RouterLink: true,
      RouterView: true,
      ...(options.global?.stubs ?? {}),
    },
  } satisfies NonNullable<MountingOptions<unknown>['global']>;

  const mountOptions = {
    ...options,
    global,
  } as MountingOptions<any>;

  return mount(component as any, mountOptions as any) as VueWrapper<any>;
};

export default mountWithApp;
