<template>
  <FCorners class="nft" size="big" :topLeftCorner="false" :bottomRightCorner="false" @click.native="onNavigate">
    <img v-if="nft.image" :src="nft.image" :alt="nft.meta?.name" loading="lazy" width="240" height="240" />
    <img
      v-else
      class="image-placeholder"
      src="@/assets/fearless-logo-animated.gif"
      alt="fearless-logo"
      width="240"
      height="240"
    />

    <div class="nft-info">
      <div class="titles">
        <span v-if="isNft" class="title">{{ upperTitle }}</span>
        <span class="title title--main">{{ title }}</span>
        <span v-if="isNft" class="title">{{ subTitle }}</span>
      </div>

      <Icon v-if="isNft" icon="export-nft" :hover="false" className="share" @click.native.stop="$emit('share', nft)" />
    </div>
  </FCorners>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router/composables';
import { type RawLocation } from 'vue-router';
import type { FearlessNft } from '@extension-base/services/nft-service/types';
import { Components } from '@/router/routes';
import router from '@/router';

type Props = {
  nft: FearlessNft;
  collectionName?: string;
  isNft: boolean;
};

const route = useRoute();
const props = withDefaults(defineProps<Props>(), { isNft: false });
const contract = computed(() => route.params.contract);

const title = ref(props.isNft ? props.nft.meta?.name : props.nft.meta.name);
const subTitle = ref(props.nft.meta.description);
const upperTitle = ref(props.collectionName ?? '');

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
  padding: 10px;
  background-color: #ee0077;
  border-radius: 50%;
}
.image-placeholder {
  width: 100%;
}
</style>
