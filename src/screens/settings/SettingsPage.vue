<template>
  <div class="settings-page">
    <header class="workspace-header">
      <h1>{{ t('settingsPage.title') }}</h1>
      <p>{{ t('settingsPage.subtitle') }}</p>
    </header>

    <ContentForm :height="contentHeight">
      <Scroll>
        <section v-for="group in groups" :key="group.title" class="settings-group">
          <h2>{{ group.title }}</h2>
          <button
            v-for="item in group.items"
            :key="item.id"
            class="settings-row"
            :class="{ unavailable: item.disabled }"
            :data-testid="`settings-${item.id}`"
            type="button"
            :disabled="item.disabled"
            @click="item.open"
          >
            <Icon :icon="item.icon" className="settings-icon" :hover="false" />
            <span class="settings-row__copy">
              <strong>{{ item.label }}</strong>
              <small>{{ item.description }}</small>
            </span>
            <span v-if="item.status" class="settings-status">{{ item.status }}</span>
            <Icon v-else icon="chevron-right" className="settings-chevron" :hover="false" />
          </button>
        </section>
      </Scroll>
    </ContentForm>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { CONTENT_FORM_HEIGHT, IS_EXTENSION } from '@/consts/global';
import { Components } from '@/router/routes';
import { lockExtension } from '@/extension/messaging';
import { useAccountsStore } from '@/stores/accounts';
import { WalletEcosystem } from '@/interfaces';
import { useI18n } from '@/locales/useI18n';

type SettingsItem = {
  id: string;
  label: string;
  description: string;
  icon: string;
  open: () => void;
  disabled?: boolean;
  status?: string;
};

type SettingsGroup = {
  title: string;
  items: SettingsItem[];
};

const emit = defineEmits(['openFiatsPopup', 'openLanguagePopup', 'openAboutPopup']);
const router = useRouter();
const accountsStore = useAccountsStore();
const { t } = useI18n();
const contentHeight = CONTENT_FORM_HEIGHT;
const open = (name: Components, params?: Record<string, string>) => () => router.push({ name, params });
const lock = () => {
  lockExtension(true);
  router.push({ name: Components.Unlock });
};
const hasTonAccount = computed(() => {
  const account = accountsStore.accounts.find(({ address }) => address === accountsStore.selectedWallet.address);

  return (
    accountsStore.selectedWallet.isTon ||
    Boolean(account?.tonAddress) ||
    Boolean(account?.universalWallet?.publicAccounts.some(({ ecosystem }) => ecosystem === WalletEcosystem.Ton))
  );
});

const groups = computed<SettingsGroup[]>(() => [
  {
    title: t('settingsPage.groups.walletsAccounts'),
    items: [
      {
        id: 'wallet-details',
        label: t('settingsPage.walletDetails'),
        description: t('settingsPage.walletDetailsDescription'),
        icon: 'account',
        open: open(Components.AccountSetting),
      },
    ],
  },
  {
    title: t('settingsPage.groups.networksAssets'),
    items: [
      {
        id: 'networks-assets',
        label: t('settingsPage.networksAssets'),
        description: t('settingsPage.networksAssetsDescription'),
        icon: 'globus',
        open: open(Components.SettingsNetworksAssets),
      },
    ],
  },
  {
    title: t('settingsPage.groups.connections'),
    items: [
      {
        id: 'iroha-connect',
        label: 'IrohaConnect',
        description: t('settingsPage.irohaConnectDescription'),
        icon: 'iroha-connect',
        open: open(Components.IrohaConnect),
      },
      {
        id: 'wallet-connect',
        label: 'WalletConnect',
        description: t('settingsPage.walletConnectDescription'),
        icon: 'wallet-connect',
        open: open(Components.WalletConnectInitAuth),
      },
      ...(hasTonAccount.value
        ? [
            {
              id: 'ton-connect',
              label: 'TonConnect',
              description: t('settingsPage.tonConnectDescription'),
              icon: 'ton',
              open: () => undefined,
              disabled: true,
              status: t('settingsPage.buildUnavailable'),
            },
          ]
        : []),
      ...(IS_EXTENSION
        ? [
            {
              id: 'connected-dapps',
              label: t('settingsPage.connectedDapps'),
              description: t('settingsPage.connectedDappsDescription'),
              icon: 'mechanic-tool',
              open: open(Components.DAppsAuths, { type: 'substrate' }),
            },
          ]
        : []),
    ],
  },
  {
    title: t('settingsPage.groups.security'),
    items: [
      {
        id: 'change-password',
        label: t('settingsPage.changePassword'),
        description: t('settingsPage.changePasswordDescription'),
        icon: 'key',
        open: open(Components.SettingsChangePassword),
      },
      {
        id: 'lock',
        label: t('settingsPage.lockApp'),
        description: t('settingsPage.lockAppDescription'),
        icon: 'lock',
        open: lock,
      },
    ],
  },
  {
    title: t('settingsPage.groups.preferences'),
    items: [
      {
        id: 'fiat',
        label: t('settingsPage.fiatCurrency'),
        description: t('settingsPage.fiatCurrencyDescription'),
        icon: 'dollar-circle',
        open: () => emit('openFiatsPopup', true),
      },
      {
        id: 'language',
        label: t('settingsPage.language'),
        description: t('settingsPage.languageDescription'),
        icon: 'language',
        open: () => emit('openLanguagePopup'),
      },
    ],
  },
  {
    title: t('settingsPage.groups.about'),
    items: [
      {
        id: 'about',
        label: t('settingsPage.aboutFearless'),
        description: t('settingsPage.aboutFearlessDescription'),
        icon: 'info',
        open: () => emit('openAboutPopup'),
      },
    ],
  },
]);
</script>

<style lang="scss" scoped>
.settings-page {
  display: flex;
  flex-direction: column;
}

.workspace-header {
  min-height: 56px;
  margin-bottom: 8px;
  text-align: left;

  h1 {
    margin: 0;
    font-size: 1.35rem;
  }

  p {
    margin: 4px 0 0;
    color: $gray-color;
    font-size: 0.72rem;
  }
}

.settings-group {
  padding: 16px 16px 4px;
  text-align: left;

  + .settings-group {
    border-top: $default-border;
  }

  h2 {
    margin: 0 0 8px;
    color: $gray-color;
    font-size: 0.68rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
}

.settings-row {
  min-height: 58px;
  width: 100%;
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border: 0;
  border-top: $default-border;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  text-align: left;

  &.unavailable {
    cursor: default;
    opacity: 0.62;
  }
}

.settings-row__copy {
  display: flex;
  flex-direction: column;

  small {
    margin-top: 4px;
    color: $gray-color;
  }
}

.settings-status {
  max-width: 92px;
  color: $gray-color;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-align: right;
  text-transform: uppercase;
}

.settings-icon {
  width: 21px;
  color: $grayish-white;
}

.settings-chevron {
  color: $gray-color;
}
</style>
