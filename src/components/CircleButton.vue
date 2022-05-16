<template>
  <div class="circle-button" :class="backgroundClass" @click="$emit('click')">
    <img :src="img" :class="imageClasses" />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

type BackgroundType = 'none' | 'black' | 'light-black';

@Component
export default class CircleButton extends Vue {
  @Prop(String) iconName!: string;
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

  get imageClasses() {
    const shiftLeft = ['chevron-left', 'send', 'send-gray'].includes(this.iconName);
    const shiftRight = ['chevron-right'].includes(this.iconName);

    return [
      'image',
      {
        'image-shift-left': shiftLeft,
        'image-shift-fight': shiftRight,
      },
    ];
  }

  get img() {
    return require(`@/assets/${this.iconName}.svg`);
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

  .image {
    opacity: 0.85;
  }

  .image-shift-left {
    margin-left: -3px;
  }

  .image-shift-fight {
    margin-right: -3px;
  }

  &:hover {
    cursor: pointer;

    .image {
      opacity: 1;
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
