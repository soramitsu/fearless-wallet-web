<template>
  <div class="circle-button" :class="backgroundClass" @click="$emit('click')">
    <s-icon :name="iconName" />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import type { IconType } from '@/util/iconName';
import getIconName from '@/util/iconName';

type BackgroundType = 'none' | 'black' | 'light-black';

@Component
export default class extends Vue {
  @Prop(String) iconType!: IconType;
  @Prop(String) backgroundColor!: BackgroundType;
  @Prop({ default: false }) backgroundColorHover!: boolean;

  get backgroundClass() {
    const _class = `background-${this.backgroundColor}`;

    return [
      _class,
      {
        [`${_class}-hover`]: this.backgroundColor === 'none' && this.backgroundColorHover,
      },
    ];
  }

  get iconName() {
    return getIconName(this.iconType);
  }
}
</script>

<style lang="scss" scoped>
.circle-button {
  width: 32px;
  height: 32px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  border-radius: 50%;

  i {
    color: rgba(255, 255, 255, 0.65);
  }

  .s-icon-arrows-arrows-diagonals-bltr-24 {
    font-size: 18px !important;
  }

  .s-icon-basic-send-24 {
    font-size: 18px !important;
  }

  .s-icon-arrows-chevron-right-24 {
    font-size: 18px !important;
  }

  .s-icon-basic-download-24 {
    font-size: 18px !important;
  }

  &:hover {
    cursor: pointer;

    i {
      color: rgba(255, 255, 255, 1);
    }
  }
}

.background-none {
  background: none;
}

.background-none-hover {
  &:hover {
    background-color: rgba(0, 0, 0, 0.25);
  }
}

.background-black {
  background-color: rgba(0, 0, 0, 0.25);
}

.background-light-black {
  background-color: rgba(255, 255, 255, 0.1);
}
</style>
