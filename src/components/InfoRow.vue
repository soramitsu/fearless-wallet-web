<template>
  <Row
    :value="value"
    :price="price"
    :icon="icon"
    :iconValue="iconValue"
    :hoverIconValue="hoverIconValue"
    :isHoverRow="isHoverRow"
    :iconAppend="iconAppend"
    :isLoading="isLoading"
    :borderType="borderType"
    :showBorder="showBorder"
    :hideLastBorder="hideLastBorder"
    :color="color"
    :isIconPrepend="isIconPrepend"
    :isIconValuePrepend="isIconValuePrepend"
    :iconClasses="iconClasses"
    @click="emit('click')"
  >
    {{ $t(text) }}

    <slot></slot>
  </Row>
</template>

<script lang="ts" setup>
import { withDefaults } from 'vue';
import Row from '@/components/Row.vue';

type BorderType = 'default' | 'secondary';
type Color = 'white' | 'pink-lavender';

interface Props {
  text: string;
  value?: string;
  price?: string;
  icon?: string;
  iconValue?: string;
  hoverIconValue?: boolean;
  isHoverRow?: boolean;
  color?: Color;
  iconAppend?: string;
  borderType?: BorderType;
  isIconPrepend?: boolean;
  isIconValuePrepend?: boolean;
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
  color: 'white',
  iconAppend: '',
  borderType: 'default',
  isIconPrepend: true,
  showBorder: true,
  hideLastBorder: true,
  isLoading: false,
  iconClasses: () => [],
});

const emit = defineEmits(['click']);
</script>
