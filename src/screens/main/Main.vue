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
      @close="setSelectWalletPopupVisible"
      @toggleWalletDetailsPopupVisible="toggleWalletDetailsPopupVisible"
    />

    <WalletDetailsPopup
      v-if="showWalletDetailsPopup"
      :buttonTopClick="buttonTopClick"
      :selectedWalletAddress="selectedWalletAddress"
      @close="toggleWalletDetailsPopupVisible"
      @closeSelectWalletPopup="setSelectWalletPopupVisible"
    />

    <FiatsPopup v-if="showFiatsPopup" :showAnimation="showFiatPopupAnimation" @handlerClose="toggleFiatsPopupVisible" />

    <LanguagePopup v-if="showLanguagePopup" @handlerClose="toggleLanguagePopupVisible" />

    <AboutPopup v-if="showAboutPopup" @handlerClose="toggleAboutPopupVisible" />

    <main class="main-content">
      <router-view v-slot="{ Component, route }">
        <keep-alive :max="20">
          <component
            :is="Component"
            :key="route.fullPath"
            class="main-child"
            @openFiatsPopup="toggleFiatsPopupVisible"
            @openLanguagePopup="toggleLanguagePopupVisible"
            @openAboutPopup="toggleAboutPopupVisible"
            @closeSelectWalletPopup="setSelectWalletPopupVisible"
          />
        </keep-alive>
      </router-view>
    </main>

    <Menu v-if="showMenu" />
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import Header from './Header.vue';
import Menu from './Menu.vue';
import SelectWalletPopup from './SelectWalletPopup.vue';
import WalletDetailsPopup from './WalletDetailsPopup.vue';
import FiatsPopup from './FiatsPopup.vue';
import AboutPopup from './AboutPopup.vue';
import LanguagePopup from './LanguagePopup.vue';
import ManageAuths from '@/screens/extension-ui/ManageAuths.vue';
import { useAccountsStore } from '@/stores/accounts';

export default defineComponent({ name: 'Main',
  components: {
    Menu,
    Header,
    FiatsPopup,
    AboutPopup,
    ManageAuths,
    LanguagePopup,
    SelectWalletPopup,
    WalletDetailsPopup,
  },
  data() {
    return {
      accountsStore: useAccountsStore(),
      buttonTopClick: 0,
      selectedWalletAddress: '',
      showSettings: false,
      showLanguagePopup: false,
      showFiatsPopup: false,
      showAboutPopup: false,
      showSelectWalletPopup: false,
      showWalletDetailsPopup: false,
      showFiatPopupAnimation: false,
      showManageAuthsVisible: false,
    };
  },
  computed: {
    highlightSettingsIcon() {
      return this.$route.meta.primaryNavigation === 'settings' || this.showAboutPopup || this.showLanguagePopup || this.showFiatsPopup;
    },
    showMenu() {
      return Boolean(this.accountsStore.selectedWallet.address);
    },
  },
  mounted() {
    void this.accountsStore.syncSoraDisclaimerStatus();
  },
  deactivated() {
    this.showSelectWalletPopup = false;
        this.showWalletDetailsPopup = false;
        this.showSettings = false;
  },
  methods: {
    toggleManageAuthsVisible() {
      this.showManageAuthsVisible = !this.showManageAuthsVisible;

          if (this.showManageAuthsVisible) this.toggleSettingsVisible();
    },
    toggleLanguagePopupVisible() {
      this.showLanguagePopup = !this.showLanguagePopup;

          if (this.showLanguagePopup) this.toggleSettingsVisible();
    },
    toggleAboutPopupVisible() {
      this.showAboutPopup = !this.showAboutPopup;

          if (this.showAboutPopup) this.toggleSettingsVisible();
    },
    toggleFiatsPopupVisible(showFiatPopupAnimation = false) {
      this.showFiatPopupAnimation = !this.showFiatsPopup ? showFiatPopupAnimation : false;
          this.showFiatsPopup = !this.showFiatsPopup;

          if (this.showFiatsPopup) this.showSettings = false;
    },
    toggleSettingsVisible() {
      if (this.showFiatsPopup || this.showLanguagePopup || this.showAboutPopup) {
            this.showFiatsPopup = false;
            this.showAboutPopup = false;
            this.showLanguagePopup = false;

            return;
          }

          if (this.$route.name !== 'Settings') this.$router.push({ name: 'Settings' });
    },
    setSelectWalletPopupVisible(value = false) {
      this.showSelectWalletPopup = value;
          this.showWalletDetailsPopup = false;
    },
    toggleWalletDetailsPopupVisible(value: boolean, buttonTop = 0, address = '') {
      this.showWalletDetailsPopup = value ?? !this.showWalletDetailsPopup;
          this.buttonTopClick = buttonTop;
          this.selectedWalletAddress = address;
    },
  },
});
</script>

<style lang="scss" scoped>
.main {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  width: 100%;
  height: $default-height-page;

  .main-content {
    position: relative;
    display: flex;
    flex: 1;
    min-height: 0;
    width: 100%;
    overflow: hidden;
  }

  .main-child {
    min-height: 0;
    height: 100%;
    flex: 1;
    width: 100%;
    overflow: hidden;
  }
}
</style>
