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

    <SettingsPopup
      v-if="showSettings"
      @handlerClose="toggleSettingsVisible"
      @openFiatsPopup="toggleFiatsPopupVisible"
      @openLanguagePopup="toggleLanguagePopupVisible"
      @openAboutPopup="toggleAboutPopupVisible"
      @openManageAuths="toggleManageAuthsVisible"
    />

    <FiatsPopup v-if="showFiatsPopup" :showAnimation="showFiatPopupAnimation" @handlerClose="toggleFiatsPopupVisible" />

    <LanguagePopup v-if="showLanguagePopup" @handlerClose="toggleLanguagePopupVisible" />

    <AboutPopup v-if="showAboutPopup" @handlerClose="toggleAboutPopupVisible" />

    <keep-alive :include="['Wallet']">
      <router-view
        class="main-child"
        @openFiatsPopup="toggleFiatsPopupVisible"
        @closeSelectWalletPopup="setSelectWalletPopupVisible"
      />
    </keep-alive>

    <Menu v-if="showMenu" />
  </div>
</template>

<script lang="ts" setup>
import { computed, onDeactivated, ref } from 'vue';
import Header from './Header.vue';
import Menu from './Menu.vue';
import SelectWalletPopup from './SelectWalletPopup.vue';
import WalletDetailsPopup from './WalletDetailsPopup.vue';
import SettingsPopup from './SettingsPopup.vue';
import FiatsPopup from './FiatsPopup.vue';
import AboutPopup from './AboutPopup.vue';
import LanguagePopup from './LanguagePopup.vue';
import { useAccountsStore } from '@/stores/accounts';

defineOptions({
  name: 'MainScreen',
});

const accountsStore = useAccountsStore();

const buttonTopClick = ref(0);
const selectedWalletAddress = ref('');
const showSettings = ref(false);
const showLanguagePopup = ref(false);
const showFiatsPopup = ref(false);
const showAboutPopup = ref(false);
const showSelectWalletPopup = ref(false);
const showWalletDetailsPopup = ref(false);
const showFiatPopupAnimation = ref(false);
const showManageAuthsVisible = ref(false);

const highlightSettingsIcon = computed(
  () => showSettings.value || showAboutPopup.value || showLanguagePopup.value || showFiatsPopup.value
);

const showMenu = computed(() => accountsStore.selectedWallet.isSubstrate);

onDeactivated(() => {
  showSelectWalletPopup.value = false;
  showWalletDetailsPopup.value = false;
  showSettings.value = false;
});

const toggleSettingsVisible = () => {
  if (!showSettings.value && (showFiatsPopup.value || showLanguagePopup.value || showAboutPopup.value)) {
    showFiatsPopup.value = false;
    showAboutPopup.value = false;
    showLanguagePopup.value = false;

    return;
  }

  showSettings.value = !showSettings.value;
};

const toggleManageAuthsVisible = () => {
  showManageAuthsVisible.value = !showManageAuthsVisible.value;

  if (showManageAuthsVisible.value) toggleSettingsVisible();
};

const toggleLanguagePopupVisible = () => {
  showLanguagePopup.value = !showLanguagePopup.value;

  if (showLanguagePopup.value) toggleSettingsVisible();
};

const toggleAboutPopupVisible = () => {
  showAboutPopup.value = !showAboutPopup.value;

  if (showAboutPopup.value) toggleSettingsVisible();
};

const toggleFiatsPopupVisible = (showAnimation = false) => {
  showFiatPopupAnimation.value = !showFiatsPopup.value ? showAnimation : false;
  showFiatsPopup.value = !showFiatsPopup.value;

  if (showFiatsPopup.value) showSettings.value = false;
};

const setSelectWalletPopupVisible = (value = false) => {
  showSelectWalletPopup.value = value;
  showWalletDetailsPopup.value = false;
};

const toggleWalletDetailsPopupVisible = (value?: boolean, buttonTop = 0, address = '') => {
  showWalletDetailsPopup.value = value ?? !showWalletDetailsPopup.value;
  buttonTopClick.value = buttonTop;
  selectedWalletAddress.value = address;
};
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
