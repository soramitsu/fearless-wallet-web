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
      <Icon v-if="shouldBeWithIcon" :icon="prepIconName" :className="prepIconClass" icon-color="pink" />

      {{ tText }}
    </SButton>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import type { ComponentText } from '@/interfaces';

type Size = 'mini' | 'small' | 'medium' | 'big';
type FontSize = 'small' | 'medium' | 'big';
type Type = 'primary' | 'secondary' | 'link' | 'google';

@Component
export default class Button extends Vue {
  iconClass = ['icon'];

  @Prop({ default: '' }) text!: ComponentText;
  @Prop(String) width!: string;
  @Prop(String) iconName!: string;
  @Prop(String) iconType!: string;
  @Prop(String) iconColor!: string;
  @Prop({ default: 'primary' }) type!: Type;
  @Prop({ default: 'medium' }) size!: Size;
  @Prop({ default: 'medium' }) fontSize!: FontSize;
  @Prop({ default: 'medium' }) borderRadius!: Size;
  @Prop({ default: false }) disabled!: boolean;
  @Prop({ default: true }) hover!: boolean;
  @Prop({ default: true }) border!: boolean;

  get tText() {
    if (typeof this.text === 'string') return this.$t(this.text);

    const { text, localeProps } = this.text;
    const { tc } = localeProps;

    if (tc) return this.$tc(text, tc, localeProps);

    return this.$t(text, localeProps);
  }

  get shouldBeWithIcon() {
    return this.iconName || this.type === 'google';
  }

  get prepIconClass() {
    const result = this.iconClass.slice();
    if (this.text === '') result.push('icon--without-text');

    if (this.iconType === 'loading') result.push('icon--loading');
    if (this.type === 'google') result.push('icon--google');

    return result;
  }

  get prepIconName() {
    if (this.type === 'google') return 'google';

    return this.iconName;
  }

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

    if (this.iconType === 'big') classes.push('button__icon');

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

    if (this.type === 'google') {
      return [
        ...classes,
        `button-font-size-${this.fontSize}`,
        'google',
        this.border ? 'google-border' : 'google-border-none',
        {
          'google-hover': this.hover,
          'google-border-hover': this.border && this.hover,
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
    padding: 10px 10px;
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
.button--content-wrap > .el-button span {
  font-size: 14px;
  font-weight: 400;
  flex-flow: row nowrap;
  white-space: break-spaces;
}

.button__icon {
  font-size: 14px;
  white-space: break-spaces;
}

.icon {
  margin-right: 8px;
  min-width: 20px;
  width: 20px;
  height: 20px;
}

.icon--without-text {
  margin: 0;
}

.icon--pink {
  color: $pink-color;
}

.icon--google {
  width: 37px;
  height: 37px;
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

.google {
  color: rgba(45, 41, 38, 1) !important;
  background-color: #c4c4c4 !important;
}

.google:disabled {
  color: rgba(45, 41, 38, 1) !important;
  background-color: #c4c4c4 !important;
}

.google-hover:not(:disabled):hover {
  background-color: rgba(255, 255, 255, 0.5) !important;
  border-color: transparent;
}

.google-border {
  border: 1px solid rgba(255, 255, 255, 0.5) !important;
}

.google-border-hover:hover {
  border: 1px solid rgba(255, 255, 255, 0.2) !important;
}

.icon--loading {
  animation: spin 2s linear infinite;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}
</style>
