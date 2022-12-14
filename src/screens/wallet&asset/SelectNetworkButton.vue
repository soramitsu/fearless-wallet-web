<template>
  <Corners class="corners">
    <button :class="classes" @click="openNetworkPopup">
      {{ textFormatted }}

      <div class="activity">
        <Icon
          v-if="showWarningIcon"
          icon="info-triangle"
          className="warning"
          @click.stop.native="$emit('toggleNetworkManagementVisible')"
        />

        <Rotate :isActive="isActive" class="icon-chevron">
          <SIcon name="chevron-bottom-16" />
        </Rotate>
      </div>
    </button>
  </Corners>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import type { CustomEvent } from '@/interfaces';
import { firstCharToUp } from '@/helpers/common';

@Component
export default class SelectNetworkButton extends Vue {
  @Prop(String) text!: string;
  @Prop(Boolean) isActive!: boolean;
  @Prop(Boolean) showWarningIcon!: boolean;

  get textFormatted() {
    if (this.text === 'all') return this.$t('common.allNetworks');

    return firstCharToUp(this.text);
  }

  get classes() {
    return [
      'select-network-button',
      {
        active: this.isActive,
      },
    ];
  }

  openNetworkPopup(event: CustomEvent) {
    const classList = event.target?.classList;

    if (!classList.contains('warning-img') && !classList.contains('info-triangle')) {
      this.$emit('openNetworkPopup');
    }
  }
}
</script>

<style lang="scss" scoped>
.corners {
  height: 36px;
}

.select-network-button {
  position: relative;
  display: flex;
  justify-content: space-between;
  clip-path: $medium-clip-path-left-top-and-right-bottom;
  border: 1px solid $default-background-color !important;
  border-radius: 5px;
  background-color: #201c1f;
  height: 36px;
  width: 250px;
  padding: 6px 12px;
  font-size: 14px;
  align-items: center;
  border: 1px solid #201c1f;
  user-select: none;
  color: $plain-white;

  &:hover {
    cursor: pointer;
  }

  .activity {
    display: flex;

    .img {
      width: 24px;
      margin-right: 7px;
    }

    .icon-chevron {
      margin-left: 7px;
    }

    .s-icon-chevron-bottom-16 {
      color: $gray-color;
      font-size: 10px !important;
    }

    .warning {
      height: 16px;
      width: 16px;
      margin-right: 5px;
      opacity: 0.9;

      &:hover {
        opacity: 1;
      }
    }
  }
}

.active {
  border: 1px solid $default-background-color;
}
</style>
