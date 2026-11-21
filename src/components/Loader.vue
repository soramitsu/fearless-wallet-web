<template>
  <div class="loader" data-testid="loader">
    <!-- The wallet's own page and section loader: the mirror's rim round the crest, three comets on it (brand kit v4). -->
    <MirrorLoader :size="96" :progress="progress">
      <img :src="crestBadge" class="logo" alt="" />
    </MirrorLoader>
  </div>
</template>

<script setup lang="ts">
import crestBadge from '@/assets/brand/crest-badge.svg';
import MirrorLoader from '@/components/MirrorLoader.vue';

defineProps<{
  /** 0-1 when the amount of work is known: the rim fills to it. Without it the comets run. */
  progress?: number;
}>();
</script>

<style lang="scss" scoped>
.loader {
  margin: auto;

  .logo {
    display: block;
    width: 52px;
    height: 52px;
  }
}
</style>
