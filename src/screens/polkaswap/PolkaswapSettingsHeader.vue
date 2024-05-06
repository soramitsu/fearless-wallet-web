<template>
  <div class="header-content">
    <div :class="classesBackIcon" data-testid="backBtn" @click="$emit('back')">
      <Icon v-show="showBackIcon" icon="chevron-left" class="img" />
    </div>

    <div class="header" data-testid="header">
      {{ header }}

      <Icon v-if="showPolkaswapIcon" icon="polkaswap" class="polkaswap" />
    </div>

    <template>
      <Icon v-if="showCloseIcon" icon="close" class="img close" @click="$emit('closeForm')" />

      <div v-else :class="classesSettings" @click="$emit('toggleSettingsVisibility')">
        <template>
          <div class="settings-text" data-testid="settingText">{{ marketType }}</div>

          <div class="settings-circle" data-testid="settingCircle">
            <Icon icon="settings" class="img" />
          </div>
        </template>
      </div>
    </template>
  </div>
</template>
<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component({})
export default class PolkaswapSettingsHeader extends Vue {
  @Prop({ type: String, default: 'Settings' }) marketType!: string;
  @Prop({ type: Boolean }) showSettings!: boolean;
  @Prop({ type: Boolean }) showPolkaswapIcon!: boolean;
  @Prop({ type: Boolean }) settingHide!: boolean;
  @Prop({ type: Boolean }) showBackIcon!: boolean;
  @Prop({ type: Boolean }) showCloseIcon!: boolean;
  @Prop({ type: Boolean }) showBackMock!: boolean;
  @Prop({ type: String }) header!: string;

  get classesSettings() {
    return ['settings', { 'setting-hide': this.settingHide }];
  }

  get classesBackIcon() {
    return [
      'back-default',
      {
        'back-mock-settings': !this.showCloseIcon,
        'back-mock': this.showBackMock || this.showSettings,
      },
    ];
  }
}
</script>

<style lang="scss" scoped>
.header-content {
  height: 64px;
  font-size: 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: $default-padding;
  border-bottom: $default-border;
}

.header {
  display: flex;
  align-items: flex-end;
  font-size: 18px;
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
    font-size: 12px;
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
