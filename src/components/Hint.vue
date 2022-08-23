<template>
  <div class="hint">
    <img :src="img" class="notifications-icon" />
    <span class="info-text" :class="getSize">
      {{ text }}
    </span>
  </div>
</template>

<script lang="ts">
import { Vue, Prop, Component } from 'vue-property-decorator';

type IconNameType = 'notification' | 'warning' | 'warning-orange';
type Size = 'big' | 'medium';
@Component
export default class Hint extends Vue {
  @Prop(String) iconName!: IconNameType;
  @Prop(String) text!: string;
  @Prop({ default: 'medium' }) size!: Size;

  get img() {
    return require(`@/assets/${this.iconName}.svg`);
  }

  get getSize() {
    return this.size === 'big' ? 'info-text--big' : 'info-text';
  }
}
</script>

<style lang="scss" scoped>
.hint {
  color: rgba(255, 255, 255, 0.65);

  i {
    color: rgba(255, 255, 255, 0.65);
  }

  display: flex;
  font-size: 12px;
  text-align: left;

  .notifications-icon {
    display: flex;
    align-items: center;
    margin-right: 15px;
  }

  .info-text {
    width: 491px;
    font-size: 14px;
    margin: auto 0;
    line-height: 14px;
  }
  .info-text--big {
    font-size: 16px;
    font-weight: 600;
    line-height: 150%;
  }
}
</style>
