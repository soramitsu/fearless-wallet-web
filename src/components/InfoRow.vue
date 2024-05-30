<template>
  <Row
    :value="value"
    :price="price"
    :icon="icon"
    :iconValue="iconValue"
    :iconAppend="iconAppend"
    :isLoading="isLoading"
    :borderType="borderType"
    :showBorder="showBorder"
    :hideLastBorder="hideLastBorder"
    :color="color"
    :isIconPrepend="isIconPrepend"
    :iconClasses="iconClasses"
  >
    {{ $t(text) }}

    <slot></slot>
  </Row>
</template>

<script lang="ts" setup>
import { defineProps, withDefaults } from 'vue';

type BorderType = 'default' | 'secondary';
type Color = 'default' | 'pink-lavender';

interface Props {
  text: string;
  value?: string;
  price?: string;
  icon?: string;
  iconValue?: string;
  color: Color;
  iconAppend?: string;
  borderType?: BorderType;
  isIconPrepend?: boolean;
  showBorder?: boolean;
  hideLastBorder?: boolean;
  isLoading?: boolean;
  iconClasses?: string[];
}

withDefaults(defineProps<Props>(), {
  text: '',
  value: '',
  price: '',
  icon: '',
  iconValue: '',
  color: 'default',
  iconAppend: '',
  borderType: 'default',
  isIconPrepend: true,
  showBorder: true,
  hideLastBorder: true,
  isLoading: false,
  iconClasses: () => [],
});
</script>
