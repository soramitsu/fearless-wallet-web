<template>
  <Popup
    :showHeader="false"
    :showBorder="true"
    :top="50"
    :handlerClose="handlerClose"
    sizeWidth="big"
    verticalPlacement="top"
    horizontalPlacement="right"
  >
    <div class="settings">
      <SettingMenuItem title="header.settings.wc" icon="wallet-connect" @onOpen="open('WalletConnectInitAuth')" />
      <SettingMenuItem v-if="isExtension" title="common.manageDApp" icon="mechanic-tool" @onOpen="openManageAuths" />
      <SettingMenuItem title="header.settings.accounts" icon="account" @onOpen="open('Accounts')" />

      <SettingMenuItem v-if="showSoraCard" title="soraCard.title" icon="card" @onOpen="open('SoraCard')" />

      <SettingMenuItem title="header.settings.currency" icon="dollar-circle" @onOpen="openPopup('openFiatsPopup')" />

      <SettingMenuItem
        title="header.settings.polkaswapDisclaimer"
        icon="polkaswap"
        @onOpen="open('PolkaswapDisclaimer')"
      />

      <SettingMenuItem title="header.settings.language.text" icon="language" @onOpen="openPopup('openLanguagePopup')" />

      <SettingMenuItem title="common.aboutApp" icon="info" @onOpen="openPopup('openAboutPopup')" />
    </div>
  </Popup>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import type { Features } from '@/store/extension/types';
import { Components } from '@/router/routes';
import SettingMenuItem from '@/screens/main/SettingMenuItem.vue';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { SelectedWallet } from '@/store';
import { IS_EXTENSION } from '@/consts/global';
import { GettersTypes as ExtensionGettersTypes } from '@/store/extension/getters';

type SettingsItemType = 'Accounts' | 'SoraCard' | 'PolkaswapDisclaimer' | 'WalletConnectInitAuth';

@Component({
  components: { SettingMenuItem },
})
export default class SettingsPopup extends Vue {
  readonly isExtension = IS_EXTENSION;

  @Prop(Function) handlerClose!: VoidFunction;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Getter(ExtensionGettersTypes.features) features!: Nullable<Features>;

  get showSoraCard() {
    return this.features?.fiat?.soraCard;
  }

  get routeName() {
    return this.$route.name;
  }

  openPopup(value: string) {
    this.$emit(value);
  }
  openManageAuths() {
    this.$router.push({ name: Components.ManageAuths });
  }

  open(name: SettingsItemType) {
    if (this.routeName !== name) this.$router.push({ name: Components[name] });

    this.handlerClose();
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
