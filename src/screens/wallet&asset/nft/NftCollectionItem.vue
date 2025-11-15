<template>
  <FCorners size="big" :topLeftCorner="false" :bottomRightCorner="false">
    <div class="nft" data-testid="nft" @click="onClick">
      <div v-if="collection.total" class="nft-counter" data-testid="nftCounter">{{ counter }}</div>

      <img :src="image" :alt="collection.name" loading="lazy" width="240" height="200" />

      <div class="nft-info">
        <span class="title title--main" data-testid="titleMain">{{ collection.name }}</span>
      </div>
    </div>
  </FCorners>
</template>

<script lang="ts" setup>
import { useRouter } from 'vue-router';
import { computed } from 'vue';
import type { NftCollection } from '@extension-base/services/nft-service/types';
import { Components } from '@/router/routes';

type Props = {
  collection: NftCollection;
};

const props = defineProps<Props>();
const router = useRouter();
const counter = computed(() => `${props.collection.ownedNfts.length}/${props.collection.total}`);
const image = computed(() => props.collection.image ?? require('@/assets/fearless-logo-animated.gif'));

const onClick = () =>
  router.push({
    name: Components.NftCollection,
    params: { contract: props.collection.address },
  });
</script>

<style lang="scss" scoped>
.nft {
  position: relative;
  display: flex;
  width: 239px;
  background: $secondary-background-color;
  clip-path: $big-clip-path-left-top-and-right-bottom;
  border-radius: $default-border-radius;
  flex-direction: column;
  cursor: pointer;
}

.nft-info {
  display: flex;
  flex-flow: row nowrap;
  justify-content: space-between;
  align-items: center;
  gap: 4px;
  padding: 20px;
  text-align: start;
  font-size: 1em;
  font-weight: 400;
  line-height: 15px;
  color: #ffffff;
  height: 70px;
}

.nft-counter {
  position: absolute;
  display: flex;
  background-color: rgba(0, 0, 0, 0.54);
  color: $gray-color;
  border: 1px solid transparent;
  border-radius: 30px;
  z-index: 100;
  right: 5px;
  top: 5px;
  font-size: 0.75rem;
  font-weight: 700;
  padding: 14px;
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
    font-size: 1em;
    line-height: 20px;
    color: #ffffff;
  }
}

.share {
  width: 42px;
  height: 42px;
  padding: 10px;
  color: #ee0077;
}
</style>
