<template>
  <div class="hint">
    <Icon :icon="iconName" :className="getClasses" />

    <span class="info-text" :class="getSize">{{ tText }}</span>
  </div>
</template>

<script lang="ts">
import { Vue, Prop, Component } from 'vue-property-decorator';
import type { ComponentText } from '@/interfaces';

type IconNameType = 'notification' | 'warning';

type Size = 'big' | 'medium';
@Component
export default class Hint extends Vue {
  baseClass = 'notifications-icon';

  @Prop(String) iconName!: IconNameType;
  @Prop({ default: '' }) text!: ComponentText;
  @Prop({ default: 'medium' }) size!: Size;

  get tText() {
    if (typeof this.text === 'string') return this.$t(this.text);

    const { text, localeProps } = this.text;

    if (localeProps) {
      const { tc } = localeProps;

      if (tc) return this.$tc(text, tc, localeProps);
    }

    return this.$t(text, localeProps);
  }

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
  display: flex;
  font-size: 12px;
  align-items: center;
  text-align: left;

  i {
    color: $grayish-white;
  }

  .warning--orange {
    color: $simple-orange-color;
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
