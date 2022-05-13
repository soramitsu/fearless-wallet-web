<template>
  <div :class="containerButtonClasses" :style="containerButtonStyle">
    <s-button
      :type="type"
      :border-radius="borderRadius"
      :size="size"
      :disabled="disabled"
      :class="buttonClasses"
      @click="$emit('click')"
    >
      <s-icon :name="icon" class="icon" v-if="icon" />

      {{ text }}
    </s-button>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import type { IconType } from '@/util/iconName';

type Size = 'mini' | 'small' | 'medium' | 'big';
type Type = 'primary' | 'secondary';

@Component
export default class extends Vue {
  @Prop(String) text!: string;
  @Prop(String) width!: string;
  @Prop({ default: 'primary' }) type!: Type;
  @Prop({ default: 'medium' }) size!: Size;
  @Prop({ default: 'medium' }) borderRadius!: Size;
  @Prop({ default: '' }) icon!: IconType;
  @Prop({ default: false }) disabled!: boolean;
  @Prop({ default: true }) hover!: boolean;
  @Prop({ default: true }) border!: boolean;

  get containerButtonClasses() {
    // for "small" and "mini" sizes also medium
    const sizeName = this.size === 'big' ? 'big' : 'medium';

    return [`button-size-${sizeName}`];
  }

  get containerButtonStyle() {
    const styles: Record<string, string> = {};

    if (this.width) styles.width = this.width;

    return styles;
  }

  get buttonClasses() {
    const classes = ['button'];

    if (this.type === 'secondary') {
      return [
        ...classes,
        'secondary',
        this.border ? 'secondary-border' : 'secondary-border-none',
        {
          'secondary-hover': this.hover,
          'secondary-border-hover': this.border && this.hover,
        },
      ];
    }

    return classes;
  }
}
</script>

<style lang="scss" scoped>
.button-size-big {
  .el-button {
    clip-path: var(--big-clip-path-left-top-and-right-bottom);
  }

  .button {
    font-size: 18px;
    width: 100%;
  }
}

.button-size-medium {
  .el-button {
    clip-path: var(--medium-clip-path-left-top-and-right-bottom);
  }

  .button {
    font-size: 13px;
    width: 100%;
  }
}

.button {
  font-size: 18px;
  width: 100%;
}

.el-button + .el-button {
  margin-left: 0;
}

.is-disabled {
  opacity: 0.7;
  background-color: #f8087b !important;
  border-color: #f8087b !important;
}

.icon {
  color: var(--pink-color);
  margin-right: 8px;
  color: #ee0077;
}

.secondary {
  background-color: rgba(255, 255, 255, 0.05) !important;
  color: #fff !important;
}

.secondary-hover:hover {
  background-color: rgba(255, 255, 255, 0.1) !important;
}

.secondary-border {
  border: 1px solid rgba(255, 255, 255, 0.1) !important;
}

.secondary-border-none {
  border: rgba(255, 255, 255, 0.05) !important;
}

.secondary-border-hover:hover {
  border: 1px solid rgba(255, 255, 255, 0.2) !important;
}
</style>
