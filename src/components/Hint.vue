<template>
  <div class="hint">
    <Icon :icon="iconName" :className="getClasses" />

    <span class="info-text" :class="getSize">{{ $t(text) }}</span>
  </div>
</template>

<script lang="ts">
import { Vue, Prop, Component } from 'vue-property-decorator';

type IconNameType = 'notification' | 'warning';

type Size = 'big' | 'medium';
@Component
export default class Hint extends Vue {
  @Prop(String) iconName!: IconNameType;
  @Prop(String) text!: string;
  @Prop({ default: 'medium' }) size!: Size;
  baseClass = 'notifications-icon';

  get getClasses() {
    if (this.iconName === 'warning') return [`${this.baseClass} warning--orange`];

    return [this.baseClass];
  }

  get getSize() {
    return this.size === 'big' ? 'info-text--big' : 'info-text';
  }
}
</script>

<style lang="scss" scoped>
.hint {
  color: $grayish-white;

  i {
    color: $grayish-white;
  }

  display: flex;
  font-size: 12px;
  align-items: center;
  text-align: left;

  .warning--orange {
    color: $error-color;
  }

  .notifications-icon {
    display: flex;
    align-items: center;
    width: 20px;
    height: 20px;
    margin-right: 15px;
  }

  .info-text {
    width: 491px;
    font-size: 14px;
    margin: auto 0;
    line-height: 19px;
  }
  .info-text--big {
    font-size: 16px;
    font-weight: 600;
    line-height: 150%;
  }
}
</style>
