<template>
  <Popup
    :showHeader="false"
    :showBlur="true"
    :showBorder="true"
    :top="50"
    :handlerClose="handlerClose"
    sizeWidth="big"
    verticalPlacement="top"
    horizontalPlacement="right"
  >
    <div class="settings">
      <SettingMenuItem title="Accounts" icon="account" @onOpen="open('Accounts')" />
      <SettingMenuItem title="Currency" icon="dollar-circle" @onOpen="openFiatsPopup" />
      <SettingMenuItem title="Language" icon="language" @onOpen="open('Language')" />
      <SettingMenuItem title="About" icon="info" />
      <SettingMenuItem title="Manage dApp access" icon="networks/polkadot" @onOpen="open('ManageAuths')" />
    </div>
  </Popup>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import Popup from '@/components/Popup.vue';
import { Components } from '@/router/routes';
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

  openFiatsPopup() {
    this.$emit('openFiatsPopup');
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
  color: rgba(255, 255, 255, 0.75);
  font-weight: 700;
  user-select: none;
}
</style>
