<template>
  <div class="circle-button" :class="backgroundClass" @click="handler">
    <s-icon :name="iconName" />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

type IconType = 'back' | 'full-screen' | 'lock' | 'settings' | 'send' | 'right' | 'download' | 'search' | 'filter';
type BackgroundType = 'none' | 'black' | 'light-black';

@Component
export default class extends Vue {
  @Prop(Function) handler!: VoidFunction;
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
    switch (this.iconType) {
      case 'back':
        return 'chevron-left-16';
      case 'full-screen':
        return 'arrows-arrows-diagonals-bltr-24';
      case 'lock':
        return 'lock-16';
      case 'settings':
        return 'basic-settings-24';
      case 'send':
        return 'basic-send-24';
      case 'right':
        return 'arrows-chevron-right-24';
      case 'download':
        return 'basic-download-24';
      case 'search':
        return 'basic-search-24';
      case 'filter':
        return 'basic-filterlist-24';
      default:
        return '';
    }
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
