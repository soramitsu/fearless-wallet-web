<template>
  <div class="main">
    <Header
      ref="header"
      :showSelectWalletPopup="showSelectWalletPopup"
      :highlightSettingsIcon="highlightSettingsIcon"
      @update:showSelectWalletPopup="setSelectWalletPopupVisible"
      @toggleSettingsVisible="toggleSettingsVisible"
    />

    <SelectWalletPopup
      v-if="showSelectWalletPopup"
      ref="SelectWalletPopup"
      @close="setSelectWalletPopupVisible(false)"
      @toggleWalletDetailsPopupVisible="toggleWalletDetailsPopupVisible"
    />

    <WalletDetailsPopup
      v-if="showWalletDetailsPopup"
      :buttonTopClick="buttonTopClick"
      :selectedWalletAddress="selectedWalletAddress"
      @close="toggleWalletDetailsPopupVisible"
      @closeSelectWalletPopup="setSelectWalletPopupVisible(false)"
    />

    <SettingsPopup
      v-if="showSettings"
      :handlerClose="toggleSettingsVisible"
      @openFiatsPopup="toggleFiatsPopupVisible"
      @openAboutPopup="toggleAboutPopupVisible"
    />

    <FiatsPopup v-if="showFiatsPopup" :handlerClose="toggleFiatsPopupVisible" />

    <AboutPopup v-if="showAboutPopup" :handlerClose="toggleAboutPopupVisible" />

    <router-view></router-view>

    <Menu />
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import Header from './Header.vue';
import Menu from './Menu.vue';
import SelectWalletPopup from './SelectWalletPopup.vue';
import WalletDetailsPopup from './WalletDetailsPopup.vue';
import SettingsPopup from './SettingsPopup.vue';
import FiatsPopup from './FiatsPopup.vue';
import AboutPopup from './AboutPopup.vue';

@Component({
  components: {
    Menu,
    Header,
    FiatsPopup,
    AboutPopup,
    SettingsPopup,
    SelectWalletPopup,
    WalletDetailsPopup,
  },
})
export default class Main extends Vue {
  buttonTopClick = 0;
  selectedWalletAddress = '';
  showSettings = false;
  showFiatsPopup = false;
  showAboutPopup = false;
  showSelectWalletPopup = false;
  showWalletDetailsPopup = false;

  get highlightSettingsIcon() {
    return this.showSettings || this.showAboutPopup || this.showFiatsPopup;
  }

  toggleAboutPopupVisible() {
    this.showAboutPopup = !this.showAboutPopup;

    if (this.showAboutPopup) this.toggleSettingsVisible();
  }

  toggleFiatsPopupVisible() {
    this.showFiatsPopup = !this.showFiatsPopup;

    if (this.showFiatsPopup) this.toggleSettingsVisible();
  }

  toggleSettingsVisible() {
    this.showSettings = !this.showSettings;
  }

  setSelectWalletPopupVisible(value: boolean) {
    this.showSelectWalletPopup = value;
    this.showWalletDetailsPopup = false;
  }

  toggleWalletDetailsPopupVisible(value: boolean, buttonTop = 0, address = '') {
    this.showWalletDetailsPopup = value ?? !this.showWalletDetailsPopup;
    this.buttonTopClick = buttonTop;
    this.selectedWalletAddress = address;
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
