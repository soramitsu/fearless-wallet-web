<template>
  <Row :value="value" :price="price" :icon="icon" class="asset-row" data-testid="assetRow" @click="onSelect">
    <ExternalLogo v-if="icon" :name="icon" :width="24" class="icon-info" :class="classes" />

    {{ text }}

    <template v-slot:details>
      <CircleButton
        iconName="chevron-right"
        backgroundColor="none"
        backgroundColorHover="black"
        class="details"
        tooltipText="wallet.assetDetails"
        target=".details"
        data-testid="details"
      />
    </template>
  </Row>
</template>

<script lang="ts" setup>
import Row from '@/components/Row.vue';

defineProps<{
  text: string;
  value: string;
  price: string;
  icon?: string;
}>();

const emit = defineEmits<{
  openAsset: [];
}>();

const classes = ['icon-info'];

function onSelect() {
  emit('openAsset');
}
</script>

<style lang="scss" scoped>
.asset-row {
  cursor: pointer;
  min-height: 56px;
  text-transform: capitalize;
}
</style>
