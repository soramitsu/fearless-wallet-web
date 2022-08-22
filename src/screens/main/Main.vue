<template>
  <div class="main">
    <Header
      :showSelectWalletPopup="showSelectWalletPopup"
      @update:showSelectWalletPopup="setSelectWalletPopupVisible"
      @toggleSettingsVisible="toggleSettingsVisible"
    />

    <SelectWalletPopup v-if="showSelectWalletPopup" @close="setSelectWalletPopupVisible(false)" />

    <SettingsPopup v-if="showSettings" :handlerClose="toggleSettingsVisible" @openFiatsPopup="toggleFiatsPopup" />

    <FiatsPopup v-if="showFiatsPopup" :handlerClose="toggleFiatsPopup" />

    <router-view></router-view>

    <Menu />
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import Header from './Header.vue';
import Menu from './Menu.vue';
import SelectWalletPopup from './SelectWalletPopup.vue';
import SettingsPopup from './SettingsPopup.vue';
import FiatsPopup from './FiatsPopup.vue';

@Component({
  components: {
    Menu,
    Header,
    FiatsPopup,
    SettingsPopup,
    SelectWalletPopup,
  },
})
export default class Main extends Vue {
  showSettings = false;
  showFiatsPopup = false;
  showSelectWalletPopup = false;

  toggleFiatsPopup() {
    this.showFiatsPopup = !this.showFiatsPopup;

    if (this.showFiatsPopup) this.toggleSettingsVisible();
  }

  toggleSettingsVisible() {
    this.showSettings = !this.showSettings;
  }

  setSelectWalletPopupVisible(value: boolean) {
    this.showSelectWalletPopup = value;
  }
}
</script>

<style lang="scss" scoped>
.main {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: $default-height-page;
}
</style>
