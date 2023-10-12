<template>
  <FCorners :hover="hover" :size="size" :topLeftCorner="topLeftCorner" :bottomRightCorner="bottomRightCorner">
    <FButton
      type="secondary"
      :border="true"
      :borderRadius="borderRadius"
      :disabled="disabled"
      :hover="hover"
      :iconName="iconName"
      :iconColor="iconColor"
      :size="size"
      :fontSize="fontSize"
      :text="text"
      :width="width"
      :loading="loading"
      @click="$emit('click')"
    />
  </FCorners>
</template>

<script lang="ts" setup>
import type { ComponentText } from '@/interfaces';

type Size = 'small' | 'medium' | 'big';
type BorderRadius = 'mini' | 'small' | 'medium' | 'big';
type FontSize = 'small' | 'medium' | 'big';
type Props = {
  text?: ComponentText;
  width?: string;
  iconName?: string;
  iconColor?: string;
  size?: Size;
  borderRadius?: BorderRadius;
  fontSize?: FontSize;
  disabled?: boolean;
  hover?: boolean;
  topLeftCorner?: boolean;
  bottomRightCorner?: boolean;
  loading?: boolean;
};

withDefaults(defineProps<Props>(), {
  text: '',
  size: 'medium',
  fontSize: 'medium',
  borderRadius: 'medium',
  disabled: false,
  hover: true,
  topLeftCorner: true,
  bottomRightCorner: true,
  loading: false,
});
</script>
