<template>
  <div :class="containerButtonClasses" :style="containerButtonStyle">
    <SButton
      :type="type"
      :border-radius="borderRadius"
      :size="size"
      :disabled="disabled"
      :class="buttonClasses"
      @click="$emit('click')"
    >
      <Icon v-if="iconName" :icon="iconName" :className="iconClass" icon-color="pink" />

      {{ text }}
    </SButton>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

type Size = 'mini' | 'small' | 'medium' | 'big';
type FontSize = 'small' | 'medium' | 'big';
type Type = 'primary' | 'secondary' | 'link';

@Component
export default class Button extends Vue {
  @Prop(String) text!: string;
  @Prop(String) width!: string;
  @Prop(String) iconName!: string;
  @Prop(String) iconColor!: string;
  @Prop({ type: String, default: '' }) iconClasses?: string;

  @Prop({ default: 'primary' }) type!: Type;
  @Prop({ default: 'medium' }) size!: Size;
  @Prop({ default: 'medium' }) fontSize!: FontSize;
  @Prop({ default: 'medium' }) borderRadius!: Size;
  @Prop({ default: false }) disabled!: boolean;
  @Prop({ default: true }) hover!: boolean;
  @Prop({ default: true }) border!: boolean;
  iconClass = ['icon'];

  get containerButtonClasses() {
    // for "small" and "mini" sizes also medium
    const sizeName = this.size === 'big' ? 'big' : 'medium';

    return [`button-size-${sizeName}`];
  }

  get containerButtonStyle() {
    const styles: Record<string, string> = {};

    if (this.width) styles.width = `${this.width}`;

    return styles;
  }

  get buttonClasses() {
    const classes = ['button', `button-font-size-${this.fontSize}`];

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

    if (this.type === 'link') {
      return [
        `button-font-size-${this.fontSize}`,
        'link',
        {
          'link-hover': this.hover,
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
    clip-path: $big-clip-path-left-top-and-right-bottom;
  }

  .button {
    width: 100%;
  }
}

.button-size-medium {
  .el-button {
    clip-path: $medium-clip-path-left-top-and-right-bottom;
  }

  .button {
    width: 100%;
  }
}

.button-font-size-big {
  font-size: 18px;
}

.button-font-size-medium {
  font-size: 16px;
}

.button-font-size-small {
  font-size: 13px;
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
  margin-right: 8px;
}

.icon--pink {
  color: $pink-color;
}

.secondary {
  background-color: $secondary-background-color !important;
  color: #fff !important;
}

.secondary-hover:hover {
  background-color: $default-background-color !important;
}

.secondary-border {
  border: 1px solid $default-background-color !important;
}

.secondary-border-none {
  border: $secondary-background-color !important;
}

.secondary-border-hover:hover {
  border: 1px solid rgba(255, 255, 255, 0.2) !important;
}

.link {
  color: $default-white !important;
}

.link-hover:hover {
  color: $default-white !important;
}
</style>
