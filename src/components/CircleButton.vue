<template>
  <div>
    <div :class="backgroundClass" @click="click($event)">
      <Icon :icon="iconName" :className="imageClasses" />
    </div>

    <Tooltip v-show="showTooltip" :text="tooltipText" :target="target" :placement="placement" />
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import type { Placement } from '@/interfaces';

type BackgroundType = 'none' | 'black' | 'light-black';
type Size = 'small' | 'medium';
type Props = {
  iconName: string;
  backgroundColor: BackgroundType;
  backgroundColorHover?: BackgroundType;
  target?: string;
  tooltipText?: string;
  placement?: Placement;
  disabled?: boolean;
  size?: Size;
};

const emit = defineEmits(['click']);
const props = withDefaults(defineProps<Props>(), {
  tooltipText: '',
  placement: 'top',
  disabled: false,
  size: 'medium',
});

const showTooltip = computed(() => props.tooltipText !== '');

const backgroundClass = computed(() => {
  const backgroundClass = `background-${props.backgroundColor}`;

  return [
    'circle-button',
    `circle-button-${props.size}`,
    backgroundClass,
    props.iconName,
    {
      [`${backgroundClass}-hover-${props.backgroundColorHover}`]: props.backgroundColor === 'none',
    },
  ];
});

const imageClasses = computed(() => {
  const shiftLeft = ['chevron-left', 'send', 'send-white'].includes(props.iconName);
  const shiftRight = ['chevron-right'].includes(props.iconName);

  return [
    'image',
    props.disabled ? 'image-disabled' : 'image-enabled',
    props.iconName,
    {
      'image-shift-left': shiftLeft,
      'image-shift-fight': shiftRight,
    },
  ];
});

const click = (event: Event) => {
  if (!props.disabled) emit('click', event);
};
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
