<template>
  <div class="header-content">
    <button v-if="showBackIcon" type="button" :class="classesBackIcon" :aria-label="$t('ux.back')" data-testid="backBtn" @click="$emit('back')">
      <Icon icon="chevron-left" class="img" aria-hidden="true" />
    </button>
    <span v-else class="back-placeholder" aria-hidden="true"></span>

    <div class="header" data-testid="header">
      {{ header }}
      <Icon v-if="showPolkaswapIcon" icon="polkaswap" class="polkaswap" aria-hidden="true" />
    </div>

    <button v-if="showCloseIcon" type="button" class="close" :aria-label="$t('common.close')" data-testid="closeForm" @click="$emit('closeForm')">
      <Icon icon="close" class="img" aria-hidden="true" />
    </button>
    <button v-else type="button" :class="classesSettings" :disabled="settingHide" :aria-label="$t('primaryMenu.settings')" :aria-expanded="showSettings" @click="$emit('toggleSettingsVisibility')">
      <span class="settings-text" data-testid="settingText">{{ marketType }}</span>
      <span class="settings-circle" data-testid="settingCircle"><Icon icon="settings" class="img" aria-hidden="true" /></span>
    </button>
  </div>
</template>
<script lang="ts">
import { defineComponent } from 'vue';

export default defineComponent({ name: 'PolkaswapSettingsHeader' ,
  props: {
    marketType: { type: String, default: 'Settings' },
    showSettings: { type: Boolean },
    showPolkaswapIcon: { type: Boolean },
    settingHide: { type: Boolean },
    showBackIcon: { type: Boolean },
    showCloseIcon: { type: Boolean },
    showBackMock: { type: Boolean },
    header: { type: String },
  },
  computed: {
    classesSettings() {
      return ['settings', { 'setting-hide': this.settingHide }];
    },
    classesBackIcon() {
      return [
            'back-default',
            {
              'back-mock-settings': !this.showCloseIcon,
              'back-mock': this.showBackMock || this.showSettings,
            },
          ];
    },
  },
});
</script>

<style lang="scss" scoped>
.header-content {
  height: 64px;
  font-size: 1.5em;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: $default-padding;
  border-bottom: $default-border;
}

.header {
  display: flex;
  align-items: flex-end;
  font-size: 1.125em;
  font-weight: 700;
  text-transform: capitalize;

  .polkaswap {
    width: 32px;
    height: 32px;
    color: $pink-color;
  }
}

.back-default {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  opacity: 0.65;
  height: 20px;
  cursor: pointer;
}

.back-mock-settings {
  width: 112px;
}

.back-mock {
  width: 20px;
  height: 20px;
  cursor: default;
}

.close {
  opacity: 0.65;
  cursor: pointer;

  &:hover {
    opacity: 0.8;
  }
}

.settings {
  display: flex;
  justify-content: space-between;
  background-color: $secondary-background-color;
  border-radius: 20px;
  height: 42px;
  min-width: 112px;
  cursor: pointer;

  .settings-text {
    display: flex;
    flex: 1 0 40px;
    justify-content: center;
    align-items: center;
    font-weight: 700;
    font-size: 0.75rem;
    color: $gray-color;
    text-transform: uppercase;
  }

  .settings-circle {
    background-color: $default-background-color;
    border-radius: 50%;
    height: 42px;
    width: 42px;
    display: flex;
    justify-content: center;
    align-items: center;
    opacity: 0.65;
  }
}

.setting-hide {
  background: none;
  cursor: default;
}

.img {
  height: 20px;
  width: 20px;
}
</style>

<style lang="scss" scoped>
.header-content {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  gap: 8px;
  min-height: 64px;
  height: auto;
  box-sizing: border-box;
}
.header { justify-content: center; flex-wrap: wrap; gap: 4px; font-size: 1.125rem; }
button { font: inherit; color: inherit; border: 0; padding: 0; min-height: 44px; min-width: 44px; }
.back-default, .close { width: 44px; height: 44px; background: transparent; }
.back-placeholder { width: 44px; }
button:disabled { opacity: 0.5; cursor: default; }
@media (max-width: 620px) {
  .settings { min-width: 44px; }
  .settings .settings-text { display: none; }
}
</style>
