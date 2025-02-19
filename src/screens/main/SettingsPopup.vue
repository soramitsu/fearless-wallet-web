<template>
  <Popup
    :showHeader="false"
    :showBorder="true"
    :top="50"
    sizeWidth="big"
    verticalPlacement="top"
    horizontalPlacement="right"
    @handlerClose="$emit('handlerClose')"
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

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Components } from '@/router/routes';
import SettingMenuItem from '@/screens/main/SettingMenuItem.vue';
import { IS_EXTENSION } from '@/consts/global';
import { lockExtension } from '@/extension/messaging';
import { useExtensionStore } from '@/stores/extension';
import { useAccountsStore } from '@/stores/accounts';

@Component({
  components: { SettingMenuItem },
})
export default class SettingsPopup extends Vue {
  readonly isExtension = IS_EXTENSION;
  extensionStore = useExtensionStore();
  accountsStore = useAccountsStore();

  get isTonWallet() {
    return this.accountsStore.selectedWallet.isTon;
  }

  get routeName() {
    return this.$route.name;
  }

  openPopup(value: string) {
    this.$emit(value);
  }

  openManageAuths() {
    this.$router.push({ name: Components.DAppsAuths, params: { type: 'substrate' } });
  }

  open(name: keyof typeof Components) {
    if (this.routeName !== name) {
      if (this.isTonWallet) this.$router.push({ name: Components.Export });
      else this.$router.push({ name: Components[name] });
    }

    this.$emit('handlerClose');
  }

  lock() {
    lockExtension(true);

    this.$router.push({ name: Components.Unlock });
  }
}
</script>

<style lang="scss" scoped>
.settings {
  color: $default-white;
  font-weight: 700;
  user-select: none;
}
</style>
