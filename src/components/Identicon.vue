<template>
  <div class="identicon">
    <div v-if="isEthereum" v-html="jdenticonHtml"></div>

    <svg v-else :width="size" :height="size" viewBox="0 0 64 64">
      <circle
        v-for="(circle, index) in polkadotCircles"
        :key="index"
        :cx="circle.cx"
        :cy="circle.cy"
        :r="circle.r"
        :fill="circle.fill"
      />
    </svg>
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { polkadotIcon } from '@polkadot/ui-shared';
import { toSvg } from 'jdenticon';
import BaseApi from '@/util/BaseApi';

const size = 24;

const props = withDefaults(defineProps<{ address: string }>(), {
  address: '',
});

const isEthereum = computed(() => BaseApi.isEthereumAddress(props.address));

const jdenticonHtml = computed(() => toSvg(props.address, size));

const polkadotCircles = computed(() => {
  if (!props.address) return [];

  try {
    return polkadotIcon(props.address, { isAlternative: false });
  } catch {
    return [];
  }
});
</script>

<style lang="scss" scoped>
.identicon {
  display: flex;
}
</style>
