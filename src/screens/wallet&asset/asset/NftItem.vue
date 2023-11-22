<template>
  <FCorners size="big" :topLeftCorner="false" :bottomRightCorner="false">
    <div class="nft">
      <img :src="nft.image.cachedUrl" :alt="nft.collection?.name" />
      <div class="nft-info">
        <!-- <span>{{ upperTitle }}</span> -->
        <span class="nft-info__title">{{ title }}</span>
        <!-- <span>{{ subTitle }}</span>
        <Icon icon="export-nft" width="42" class="nft-info__share" /> -->
      </div>
    </div>
  </FCorners>
</template>

<script lang="ts" setup>
import { onMounted, ref } from 'vue';
import type { OwnedNft } from 'alchemy-sdk';

type Props = {
  nft: OwnedNft;
};

const props = defineProps<Props>();
const title = ref(props.nft.collection?.name ?? '');
// const subTitle = ref('#1 subtitle');
// const upperTitle = ref('#1 subtitle');

onMounted(() => {});
</script>
<style lang="scss">
.nft {
  display: flex;
  width: 239px;
  background: $secondary-background-color;
  border: none;
  clip-path: $big-clip-path-left-top-and-right-bottom;
  border-radius: $default-border-radius;
  flex-direction: column;
  overflow: hidden;
}

.nft-info {
  padding: 20px;
  text-align: start;
  font-size: 16px;
  line-height: 20px;
}
</style>
