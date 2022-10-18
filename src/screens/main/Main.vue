<template>
  <div class="main">
    <Header
      :showSelectWalletPopup="showSelectWalletPopup"
      :highlightSettingsIcon="highlightSettingsIcon"
      @update:showSelectWalletPopup="setSelectWalletPopupVisible"
      @toggleSettingsVisible="toggleSettingsVisible"
    />

    <SelectWalletPopup
      v-if="showSelectWalletPopup"
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
      @openManageAuths="toggleManageAuthsVisible"
    />

    <FiatsPopup v-if="showFiatsPopup" :showAnimation="showFiatPopupAnimation" :handlerClose="toggleFiatsPopupVisible" />

    <AboutPopup v-if="showAboutPopup" :handlerClose="toggleAboutPopupVisible" />

    <ManageAuths v-if="showManageAuthsVisible" :handlerClose="toggleManageAuthsVisible" />

    <router-view class="main-child" @openFiatsPopup="toggleFiatsPopupVisible"></router-view>

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
import ManageAuths from '@/screens/authorize/ManageAuths.vue';

@Component({
  components: {
    Menu,
    Header,
    FiatsPopup,
    AboutPopup,
    ManageAuths,
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
  showFiatPopupAnimation = false;
  showManageAuthsVisible = false;

  get highlightSettingsIcon() {
    return this.showSettings || this.showAboutPopup || this.showFiatsPopup;
  }

  toggleManageAuthsVisible() {
    this.showManageAuthsVisible = !this.showManageAuthsVisible;

    if (this.showManageAuthsVisible) this.toggleSettingsVisible();
  }

  toggleAboutPopupVisible() {
    this.showAboutPopup = !this.showAboutPopup;

    if (this.showAboutPopup) this.toggleSettingsVisible();
  }

  toggleFiatsPopupVisible(showFiatPopupAnimation = false) {
    this.showFiatPopupAnimation = !this.showFiatsPopup ? showFiatPopupAnimation : false;
    this.showFiatsPopup = !this.showFiatsPopup;

    if (this.showFiatsPopup) this.showSettings = false;
  }

  toggleSettingsVisible() {
    if (!this.showSettings && (this.showFiatsPopup || this.showAboutPopup)) {
      this.showFiatsPopup = false;
      this.showAboutPopup = false;

      return;
    }

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
  justify-content: space-between;
  width: 100%;
  height: $default-height-page;

  .main-child {
    height: $default-height-page;
    width: 100%;
  }
}
</style>
