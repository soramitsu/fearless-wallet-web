<template>
  <FCorners size="big" :topLeftCorner="false" :bottomRightCorner="false">
    <div class="nft">
      <img :src="nft.meta.image" :alt="nft.meta?.name" loading="lazy" width="240" height="240" />
      <div class="nft-info">
        <div class="titles">
          <span v-if="isNft" class="title">{{ upperTitle }}</span>
          <span class="title title--main">{{ title }}</span>
          <span v-if="isNft" class="title">{{ subTitle }}</span>
        </div>

        <Icon v-if="isNft" icon="export-nft" width="42px" height="42px" class="share" />
      </div>
    </div>
  </FCorners>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import type { FearlessNft } from '@extension-base/services/nft-service/types';

type Props = {
  nft: FearlessNft;
};
const props = defineProps<Props>();

const isNft = ref(false);
const title = ref(isNft.value ? props.nft.meta?.name : props.nft.meta.name);
const subTitle = ref(props.nft.meta.description);
const upperTitle = ref(isNft.value ? props.nft.meta.name : '');
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

  .title {
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
