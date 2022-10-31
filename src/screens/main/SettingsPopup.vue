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
      <SettingMenuItem title="Accounts" icon="account" @onOpen="open('Accounts')" />

      <SettingMenuItem title="Currency" icon="dollar-circle" @onOpen="openPopup('openFiatsPopup')" />

      <SettingMenuItem title="Language" icon="language" @onOpen="openPopup('openLanguagePopup')" />

      <SettingMenuItem title="About" icon="info" @onOpen="openPopup('openAboutPopup')" />

      <SettingMenuItem
        v-if="isExtension"
        title="Manage dApp access"
        icon="polkadot"
        @onOpen="openPopup('openManageAuths')"
      />
    </div>
  </Popup>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import Popup from '@/components/Popup.vue';
import { Components } from '@/router/routes';
import { isExtension } from '@/helpers/common';
import SettingMenuItem from '@/layouts/SettingMenuItem.vue';

type SettingsItemType = 'Accounts';

@Component({
  components: { Popup, SettingMenuItem },
})
export default class SettingsPopup extends Vue {
  @Prop(Function) handlerClose!: VoidFunction;

  get routeName() {
    return this.$route.name;
  }

  get isExtension() {
    return isExtension();
  }

  openPopup(value: string) {
    this.$emit(value);
  }

  open(name: SettingsItemType) {
    if (this.routeName !== name) {
      this.$router.push({ name: Components[name] });
    }

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
