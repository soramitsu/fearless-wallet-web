<template>
  <Popup
    :showHeader="false"
    :showBorder="true"
    :top="50"
    sizeWidth="big"
    verticalPlacement="top"
    horizontalPlacement="right"
    @handlerClose="handleClose"
  >
    <div class="settings">
      <template v-if="!isTonWallet">
        <SettingMenuItem
          title="common.wc"
          icon="wallet-connect"
          data-testid="walletConnect"
          @onOpen="open('WalletConnectInitAuth')"
        />

        <SettingMenuItem
          v-if="isExtension"
          title="common.manageDApp"
          icon="mechanic-tool"
          data-testid="manageDApp"
          @onOpen="openManageAuths"
        />

        <SettingMenuItem
          title="header.settings.polkaswapDisclaimer"
          icon="polkaswap"
          data-testid="polkaswapDisclaimer"
          @onOpen="open('PolkaswapDisclaimer')"
        />
      </template>

      <SettingMenuItem
        title="header.settings.walletBackup"
        icon="account"
        data-testid="accounts"
        @onOpen="open('AccountSetting')"
      />

      <SettingMenuItem
        title="header.settings.currency"
        icon="dollar-circle"
        data-testid="currency"
        @onOpen="openPopup('openFiatsPopup')"
      />

      <SettingMenuItem
        title="header.settings.language.text"
        icon="language"
        data-testid="language"
        @onOpen="openPopup('openLanguagePopup')"
      />

      <SettingMenuItem
        title="common.changePassword"
        icon="key"
        data-testid="changePassword"
        @onOpen="open('ChangePassword')"
      />

      <SettingMenuItem title="common.lockApp" icon="lock" data-testid="lockApp" @onOpen="lock" />

      <SettingMenuItem
        title="common.aboutApp"
        icon="info"
        data-testid="aboutApp"
        @onOpen="openPopup('openAboutPopup')"
      />
    </div>
  </Popup>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Components } from '@/router/routes';
import SettingMenuItem from '@/screens/main/SettingMenuItem.vue';
import { IS_EXTENSION } from '@/consts/global';
import { lockExtension } from '@/extension/messaging';
import { useAccountsStore } from '@/stores/accounts';

defineOptions({
  name: 'SettingsPopup',
});

const router = useRouter();
const route = useRoute();
const accountsStore = useAccountsStore();

const isExtension = IS_EXTENSION;

const isTonWallet = computed(() => accountsStore.selectedWallet.isTon);
const routeName = computed(() => route.name as keyof typeof Components | undefined);

type PopupEvent = 'openFiatsPopup' | 'openLanguagePopup' | 'openAboutPopup';

const emit = defineEmits<{
  handlerClose: [];
  openFiatsPopup: [];
  openLanguagePopup: [];
  openAboutPopup: [];
}>();

const handleClose = () => emit('handlerClose');

const openPopup = (value: PopupEvent) => {
  emit(value);
};

const openManageAuths = () => {
  router.push({ name: Components.DAppsAuths, params: { type: 'substrate' } });
};

const open = (name: keyof typeof Components) => {
  if (routeName.value !== name) {
    if (isTonWallet.value && name === 'AccountSetting') {
      router.push({ name: Components.Export });
    } else {
      router.push({ name: Components[name] });
    }
  }

  handleClose();
};

const lock = () => {
  lockExtension(true);
  router.push({ name: Components.Unlock });
};
</script>

<style lang="scss" scoped>
.settings {
  color: $default-white;
  font-weight: 700;
  user-select: none;
}
</style>
