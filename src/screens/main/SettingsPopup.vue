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
      <SettingMenuItem title="header.settings.accounts" icon="account" @onOpen="open('Accounts')" />

      <SettingMenuItem title="header.settings.currency" icon="dollar-circle" @onOpen="openPopup('openFiatsPopup')" />

      <SettingMenuItem
        title="header.settings.polkaswapDisclaimer"
        icon="polkaswap"
        @onOpen="open('PolkaswapDisclaimer')"
      />

      <SettingMenuItem title="header.settings.language.text" icon="language" @onOpen="openPopup('openLanguagePopup')" />

      <SettingMenuItem title="common.aboutApp" icon="info" @onOpen="openPopup('openAboutPopup')" />

      <SettingMenuItem
        v-if="isExtension"
        title="common.manageDApp"
        icon="mechanic-tool"
        @onOpen="openPopup('openManageAuths')"
      />
    </div>
  </Popup>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

import { Getter } from 'vuex-class';
import { Components } from '@/router/routes';
import SettingMenuItem from '@/screens/main/SettingMenuItem.vue';
import BaseApi from '@/util/BaseApi';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { SelectedWallet } from '@/store';

type SettingsItemType = 'Accounts';

@Component({
  components: { SettingMenuItem },
})
export default class SettingsPopup extends Vue {
  @Prop(Function) handlerClose!: VoidFunction;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;

  get routeName() {
    return this.$route.name;
  }

  get isExtension() {
    return BaseApi.isExtension();
  }

  openPopup(value: string) {
    this.$emit(value);
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
