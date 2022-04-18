<template>
  <div class="circle-button" :class="backgroundClass" @click="handler">
    <s-icon :name="iconName" />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
type IconType = 'back' | 'full-screen' | 'lock' | 'settings';

@Component
export default class extends Vue {
  @Prop(Function) handler!: VoidFunction;
  @Prop(String) iconType!: IconType;
  @Prop({ default: true }) background!: boolean;

  get backgroundClass() {
    return this.background ? 'background' : '';
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

  &:hover {
    cursor: pointer;
    opacity: 1;
  }
}

.background {
  background-color: rgba(255, 255, 255, 0.1);
}
</style>
