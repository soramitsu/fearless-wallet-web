<template>
  <div class="double-assets">
    <AssetHighlightIcon
      :icon="props.icon1"
      :shadowColor="props.shadowColor1"
      class="icon-1"
      :size="props.size"
      moveHorizontalShadow="left"
    />

    <AssetHighlightIcon
      :icon="props.icon2"
      :shadowColor="props.shadowColor2"
      class="asset-highlight"
      :size="props.size"
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

  .asset-highlight {
    position: relative;
    left: -32px;
  }
}
</style>
