<template>
  <FCorners size="big" :topLeftCorner="false" :bottomRightCorner="false">
    <div class="nft">
      <img :src="nft.image.cachedUrl" :alt="nft.collection?.name" />
      <div class="nft-info">
        <div class="titles">
          <span v-if="isNft" class="title--overflow">{{ upperTitle }}</span>
          <span class="title--main title--overflow">{{ title }}</span>
          <span v-if="isNft" class="title--overflow">{{ subTitle }}</span>
        </div>

        <Icon v-if="isNft" icon="export-nft" width="42px" height="42px" class="share" />
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
const isNft = ref(false);
const props = defineProps<Props>();
const title = ref(props.nft.collection?.name ?? '');
const subTitle = ref('#1 subtitle');
const upperTitle = ref('#1 subtitle');

onMounted(() => {});
</script>

<style lang="scss">
.nft {
  display: flex;
  width: 239px;
  background: $secondary-background-color;
  clip-path: $big-clip-path-left-top-and-right-bottom;
  border-radius: $default-border-radius;
  flex-direction: column;
}

.nft-info {
  display: flex;
  flex-flow: row nowrap;
  justify-content: space-between;
  align-items: center;
  gap: 4px;
  padding: 20px;
  text-align: start;
  font-size: 12px;
  font-weight: 400;
  line-height: 15px;
  color: $grayish-white;
}

.titles {
  display: flex;
  flex-flow: column;
  gap: 8px;
  max-width: 150px;

  .title--overflow {
    text-overflow: ellipsis;
    overflow: hidden;
    white-space: nowrap;
  }

  .title--main {
    font-weight: 600;
    font-size: 16px;
    line-height: 20px;
    color: #ffffff;
  }
}

.share {
  width: 42px;
  height: 42px;
}
</style>
