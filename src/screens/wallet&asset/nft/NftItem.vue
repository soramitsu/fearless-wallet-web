<template>
  <FCorners class="nft" size="big" :topLeftCorner="false" :bottomRightCorner="false" @click.native="onNavigate">
    <video v-if="isMp4" :src="imageUrl" width="240" height="240"></video>
    <img v-else :src="imageUrl" :alt="nft.meta?.name" width="240" height="240" />

    <div class="nft-info">
      <div class="titles">
        <span class="title" data-testid="title">{{ upperTitle }}</span>
        <span class="title title--main" data-testid="titleMain">{{ title }}</span>
        <span class="title" data-testid="subTitle">{{ subTitle }}</span>
      </div>

      <div v-if="isOwned" class="icon-ownership" data-testid="ownership">
        <Icon
          icon="check"
          className="icon-ownership-size"
          data-testid="check"
          :hover="false"
          iconColor="success"
          width="20px"
          height="20px"
        />
      </div>
      <Icon v-else icon="export-nft" className="share" data-testid="export" @click.native.stop="$emit('share', nft)" />
    </div>
  </FCorners>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router/composables';
import { type RawLocation } from 'vue-router';
import type { FearlessNft } from '@extension-base/services/nft-service/types';
import { Components } from '@/router/routes';
import router from '@/router';

type Props = {
  nft: FearlessNft;
  collectionName?: string;
};
const route = useRoute();
const props = defineProps<Props>();

const contract = computed(() => route.params.contract);
const isOwned = computed(() => props.nft.isOwned);
const title = computed(() => props.nft?.meta?.name ?? '');
const subTitle = computed(() => props.nft.meta.description ?? '');
const upperTitle = computed(() => props.collectionName ?? '');

const contentType = computed(() => props.nft.contentType);
const isMp4 = computed(() => contentType.value === 'video/mp4');
const imageUrl = computed(() => props.nft.image ?? require('@/assets/fearless-logo-animated.gif'));

const onNavigate = () => {
  const route: RawLocation = { name: Components.NftDetails, params: { id: props.nft.id, contract: contract.value } };
  router.push(route);
};
</script>

<style lang="scss" scoped>
.nft {
  display: flex;
  width: 239px;
  height: fit-content;
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
  font-size: 0.75em;
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
    font-size: 1em;
    line-height: 20px;
    color: #ffffff;
  }
}

.share {
  width: 42px;
  height: 42px;
  padding: 10px;
  background-color: #ee0077;
  border-radius: 50%;
}

.icon-ownership {
  background-color: #000000b2;
  border-radius: 50%;
  padding: 10px;
  pointer-events: none;
  right: 17px;
  top: 5px;
  width: 40px;
  height: 40px;

  &-size {
    width: 20px;
    height: 20px;
  }
}
</style>
