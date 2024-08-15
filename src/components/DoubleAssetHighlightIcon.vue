<template>
  <div class="double-assets" data-testid="doubleAssets">
    <AssetHighlightIcon
      :icon="props.icon1"
      :shadowColor="props.shadowColor1"
      :size="props.size"
      class="icon-1"
      moveHorizontalShadow="left"
    />

    <AssetHighlightIcon
      :icon="props.icon2"
      :shadowColor="props.shadowColor2"
      :size="props.size"
      class="icon-2"
      moveHorizontalShadow="right"
    />
  </div>
</template>

<script lang="ts" setup>
type Props = {
  icon1: string;
  icon2: string;
  shadowColor1: string;
  shadowColor2: string;
  size: 'small' | 'medium' | 'big';
};

const props = defineProps<Props>();
</script>

<style lang="scss" scoped>
.double-assets {
  display: flex;

  .icon-1 {
    z-index: 1;
  }

  .icon-2 {
    position: relative;
    left: -32px;
  }
}
</style>
