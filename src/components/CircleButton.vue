<template>
  <div>
    <div class="circle-button" :class="backgroundClass" @click="$emit('click', $event)">
      <Icon :icon="iconName" :className="imageClasses" />
    </div>

    <Tooltip v-show="showTooltip" :text="tooltipText" :target="target" :placement="placement" />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import type { Placement } from '@/interfaces';
import Tooltip from '@/components/Tooltip.vue';

type BackgroundType = 'none' | 'black' | 'light-black';

@Component({
  components: { Tooltip },
})
export default class CircleButton extends Vue {
  @Prop(String) iconName!: string;
  @Prop(String) backgroundColor!: BackgroundType;
  @Prop(String) backgroundColorHover!: BackgroundType;
  @Prop({ default: '' }) tooltipText!: string;
  @Prop(String) target!: string;
  @Prop({ default: 'top' }) placement!: Placement;

  get showTooltip() {
    return this.tooltipText !== '';
  }

  get backgroundClass() {
    const _class = `background-${this.backgroundColor}`;

    return [
      _class,
      this.iconName,
      {
        [`${_class}-hover-${this.backgroundColorHover}`]: this.backgroundColor === 'none',
      },
    ];
  }

  get imageClasses() {
    const shiftLeft = ['chevron-left', 'send', 'send-white'].includes(this.iconName);
    const shiftRight = ['chevron-right'].includes(this.iconName);

    return [
      'image',
      this.iconName,
      {
        'image-shift-left': shiftLeft,
        'image-shift-fight': shiftRight,
      },
    ];
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
  align-items: center;
  border-radius: 50%;
  user-select: none;

  .image {
    filter: invert(0.35);
    width: 16px;
    height: 16px;
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

    .image {
      filter: invert(0.2);
    }
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
