<template>
  <div :class="popupBackgroundClasses" :style="popupBackgroundStyles" @click="backgroundClick">
    <FCorners size="big" :topLeftCorner="showBorder" :bottomRightCorner="showBorder" :style="popupContainerStyle">
      <div :class="popupContainerClasses" :style="popupContainerStyles">
        <div v-if="showHeader" class="header" :class="headerCentered">
          <SearchInput
            v-if="showSearch"
            :value="filterValue"
            :placeholder="placeholder"
            width="235px"
            @change="changeFilterValue"
          />

          <template v-else>
            <div class="button-close"></div>
            <div class="header-with-icon">
              <Icon v-if="isIcon" className="attention-icon" icon="info-triangle" />

              <div v-if="headerText" :class="headerClasses" data-testid="headerText">{{ $t(headerText) }}</div>
            </div>
          </template>

          <SButton v-if="showCloseButton" type="link" class="button-close" data-testid="basicCloseBtn" @click="close">
            <SIcon name="basic-close-24" />
          </SButton>
        </div>

        <Scroll>
          <div class="content">
            <slot></slot>
          </div>
        </Scroll>
      </div>
    </FCorners>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import { IS_EXTENSION } from '@/consts/global';

type HorizontalPlacement = 'left' | 'center' | 'right';
type VerticalPlacement = 'top' | 'center' | 'bottom';
type Size = 'mini' | 'small' | 'medium' | 'big';
type HeaderType = 'default' | 'success' | 'failed' | 'pending';

const filterValue = ref('');

type Props = {
  top?: number;
  left?: number;
  height?: number;
  maxHeight?: number;
  headerText?: string;
  placeholder?: string;
  isIcon?: boolean;
  showHeader?: boolean;
  showBlur?: boolean;
  showAnimation?: boolean;
  showBackground?: boolean;
  closeByBackground?: boolean;
  showSearch?: boolean;
  showBorder?: boolean;
  sizeWidth?: Size;
  showCloseButton?: boolean;
  horizontalPlacement?: HorizontalPlacement;
  verticalPlacement?: VerticalPlacement;
  headerType?: HeaderType;
  zIndex?: number;
};

const props = withDefaults(defineProps<Props>(), {
  headerText: '',
  placeholder: '',
  isIcon: false,
  showHeader: true,
  showBlur: true,
  showAnimation: true,
  showBackground: true,
  closeByBackground: true,
  showSearch: false,
  showBorder: false,
  sizeWidth: 'medium',
  showCloseButton: true,
  horizontalPlacement: 'center',
  verticalPlacement: 'center',
  headerType: 'default',
  zIndex: 199,
});

const emit = defineEmits(['handlerFilter', 'handlerClose']);

const popupBackgroundClasses = computed(() => {
  const classes = [
    'popup-background',
    props.showBackground ? 'popup-background-show' : 'popup-background-hide',
    {
      'popup-background-blur': props.showBlur && props.showBackground,
      'popup-background-animation': props.showAnimation,
    },
  ];

  if (props.showBackground)
    classes.push(
      `popup-background-horizontal-placement-${props.horizontalPlacement}`,
      `popup-background-vertical-placement-${props.verticalPlacement}`
    );

  return classes;
});

const popupContainerClasses = computed(() => {
  const classes = [
    'popup-container',
    {
      border: props.showBorder,
    },
  ];

  if (props.sizeWidth) classes.push(`width-${props.sizeWidth}`);

  return classes;
});

const popupContainerStyles = computed(() => {
  const styles: Record<string, string> = {};

  if (props.height) styles.height = `${props.height}px`;

  if (props.maxHeight) styles.maxHeight = `${props.maxHeight}px`;

  return styles;
});

const headerCentered = computed(() => (!props.showCloseButton ? 'header--centered' : ''));

const headerClasses = computed(() => {
  return [
    'header-text',
    {
      'header-text-success': props.headerType === 'success',
      'header-text-pending': props.headerType === 'pending',
      'header-text-failed': props.headerType === 'failed',
    },
  ];
});

const topLeftStyles = computed(() => {
  const styles: Record<string, string> = {};

  if (props.top) styles.top = `${props.top}px`;

  if (props.left) styles.left = IS_EXTENSION ? `${props.left}px` : '0';

  return styles;
});

const popupBackgroundStyles = computed(() => {
  const styles: Record<string, string> = !props.showBackground ? topLeftStyles.value : {};

  if (props.zIndex) styles.zIndex = props.zIndex.toString();

  return styles;
});

const popupContainerStyle = computed(() => (props.showBackground ? topLeftStyles.value : {}));

watch(filterValue, (value) => emit('handlerFilter', value));

const changeFilterValue = (value: string) => {
  filterValue.value = value;
};

const close = () => emit('handlerClose');

const backgroundClick = (event: CustomEvent) => {
  if (props.closeByBackground && (event.target as Element)?.classList.contains('popup-background')) close();
};
</script>

<style lang="scss" scoped>
.popup-background {
  display: flex;
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  right: 0;
  margin: 0 auto;
  width: fit-content;
  height: fit-content;

  .popup-container {
    display: flex;
    flex-direction: column;
    justify-content: center;
    position: relative;
    top: 0;
    min-height: 52px;
    min-width: 230px;
    max-height: 410px;
    max-width: 480px;
    background-color: #111111;
    clip-path: $big-clip-path-left-top-and-right-bottom;
    border-radius: $default-border-radius;
    padding: 15px 0 13px;
  }

  .header-with-icon {
    display: flex;
    flex-flow: column;
    gap: 12px;
  }

  .attention-icon {
    height: 38px;
  }

  .width-big {
    min-width: 370px;
    max-width: 450px;
  }

  .width-medium {
    width: 300px;
  }

  .width-small {
    width: 285px;
  }

  .width-mini {
    width: 230px;
  }

  .border {
    border: $default-border;
  }

  .content {
    width: 100%;
    height: 100%;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    width: 100%;
    padding-left: $default-padding;
    padding-right: 22px;
    margin-bottom: 10px;

    .header-text {
      font-weight: 700;
      font-size: 1.125em;
      color: $plain-white;
    }

    .header-text-success {
      color: $success-color;
    }

    .header-text-pending {
      color: $simple-orange-color;
    }

    .header-text-failed {
      color: $reject-color;
    }
  }
  .header--centered {
    align-items: center;
    justify-content: center;
  }

  .s-icon-basic-close-24 {
    color: $grayish-white;

    &:hover {
      color: rgba(255, 255, 255, 0.8);
    }
  }

  .button-close {
    padding: 0;
    width: 20px;
    height: 20px;
    margin: auto 0;
  }
}

.popup-background-show {
  height: 100%;
  width: $extension-width;
  padding: $default-padding;
}

.popup-background-hide {
  width: fit-content;
  height: fit-content;
}

.popup-background-blur {
  background-color: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(5px);
}

.popup-background-animation {
  @include opacity;
}

.popup-background-horizontal-placement-left {
  justify-content: flex-start;
}

.popup-background-horizontal-placement-center {
  justify-content: center;
}

.popup-background-horizontal-placement-right {
  justify-content: flex-end;
}

.popup-background-vertical-placement-top {
  align-items: flex-start;
}

.popup-background-vertical-placement-center {
  align-items: center;
}

.popup-background-vertical-placement-bottom {
  align-items: flex-end;
}

.fw-web {
  .popup-background-show {
    width: auto;
  }
}
</style>
