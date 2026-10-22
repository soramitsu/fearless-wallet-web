<template>
  <div>
    <button
      type="button"
      :class="backgroundClass"
      :disabled="disabled"
      :aria-label="accessibleLabel"
      @click="click($event)"
    >
      <Icon :icon="iconName" :className="imageClasses" aria-hidden="true" />
    </button>

    <Tooltip v-show="showTooltip" :text="tooltipText" :target="target" :placement="placement" />
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import type { Placement } from '@/interfaces';
import { useI18n } from '@/locales/useI18n';

type BackgroundType = 'none' | 'black' | 'light-black';

type Size = 'small' | 'medium' | 'big' | 'large';

type Props = {
  iconName: string;
  ariaLabel?: string;
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

const { t } = useI18n();
const actionLabels: Record<string, string> = {
  'chevron-left': 'ux.back',
  'chevron-right': 'common.next',
  expand: 'common.fullScreen',
  settings: 'header.settingsAndManagement',
  copy: 'common.copyToClipboard',
  close: 'common.close',
  cross: 'common.close',
  reload: 'ux.refresh',
  search: 'ux.search',
  send: 'assets.send',
  'send-white': 'assets.send',
  receive: 'assets.receive',
  'receive-white': 'assets.receive',
  swap: 'primaryMenu.polkaswap',
  'cross-chain': 'ux.transferNetworks',
  'arrow-link': 'ux.openExplorer',
  share: 'ux.share',
  'plus-pink': 'ux.add',
  filter: 'common.filters',
};
const accessibleLabel = computed(
  () => props.ariaLabel || t(props.tooltipText || actionLabels[props.iconName] || 'ux.moreOptions')
);

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
  appearance: none;
  padding: 0;
  border: 0;
  color: inherit;
  background: transparent;
  flex-shrink: 0;

  &:focus-visible {
    outline: 2px solid $pink-color;
    outline-offset: 3px;
  }
  &:disabled {
    cursor: default;
    opacity: 0.5;
  }
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
  width: 32px;
  height: 32px;

  .image {
    width: 8px;
    height: 8px;
  }
}

.circle-button-medium {
  width: 44px;
  height: 44px;

  .image {
    width: 18px;
    height: 18px;
  }
}

.circle-button-big {
  width: 44px;
  height: 44px;

  .image {
    width: 24px;
    height: 24px;
  }
}

.circle-button-large {
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
