<template>
  <div>
    <div :class="backgroundClass" @click="click($event)">
      <Icon :icon="iconName" :className="imageClasses" />
    </div>

    <Tooltip v-show="showTooltip" :text="tooltipText" :target="target" :placement="placement" />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import type { Placement } from '@/interfaces';

type BackgroundType = 'none' | 'black' | 'light-black';
type Size = 'small' | 'medium' | 'big';

@Component
export default class CircleButton extends Vue {
  @Prop(String) iconName!: string;
  @Prop(String) backgroundColor!: BackgroundType;
  @Prop(String) backgroundColorHover!: BackgroundType;
  @Prop(String) target!: string;
  @Prop({ default: '' }) tooltipText!: string;
  @Prop({ default: 'top' }) placement!: Placement;
  @Prop({ default: false }) disabled!: boolean;
  @Prop({ default: 'medium' }) size!: Size;

  get showTooltip() {
    return this.tooltipText !== '';
  }

  get backgroundClass() {
    const backgroundClass = `background-${this.backgroundColor}`;

    return [
      'circle-button',
      `circle-button-${this.size}`,
      backgroundClass,
      this.iconName,
      {
        [`${backgroundClass}-hover-${this.backgroundColorHover}`]: this.backgroundColor === 'none',
      },
    ];
  }

  get imageClasses() {
    const shiftLeft = ['chevron-left', 'send', 'send-white'].includes(this.iconName);
    const shiftRight = ['chevron-right'].includes(this.iconName);

    return [
      'image',
      this.disabled ? 'image-disabled' : 'image-enabled',
      this.iconName,
      {
        'image-shift-left': shiftLeft,
        'image-shift-fight': shiftRight,
      },
    ];
  }

  click(event: Event) {
    if (!this.disabled) this.$emit('click', event);
  }
}
</script>

<style lang="scss" scoped>
.circle-button {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  border-radius: 50%;
  user-select: none;

  .image {
    outline: none;
  }

  .image-enabled {
    filter: invert(0.35);
  }

  .image-disabled {
    filter: invert(0.8);
  }

  .image-shift-left {
    margin-left: -3px;
    width: 16px;
    height: 16px;
  }

  .image-shift-fight {
    margin-right: -3px;
  }

  &:hover {
    cursor: pointer;

    .image-enabled {
      filter: invert(0.2);
    }
  }
}

.circle-button-small {
  width: 16px;
  height: 16px;

  .image {
    width: 8px;
    height: 8px;
  }
}

.circle-button-medium {
  width: 32px;
  height: 32px;

  .image {
    width: 18px;
    height: 18px;
  }
}

.circle-button-big {
  width: 32px;
  height: 32px;

  .image {
    width: 24px;
    height: 24px;
  }
}

.circle-button-big {
  width: 48px;
  height: 48px;

  .image {
    width: 32px;
    height: 32px;
  }
}

.background-none {
  background: none;
}

.background-none-hover-black {
  &:hover {
    background-color: rgba(0, 0, 0, 0.25);
  }
}

.background-none-hover-light-black {
  &:hover {
    background-color: $default-background-color;
  }
}

.background-black {
  background-color: rgba(0, 0, 0, 0.25);
}

.background-light-black {
  background-color: $default-background-color;
}
</style>
