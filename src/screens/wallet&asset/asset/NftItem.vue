<template>
  <div>
    <FCorners class="nft" size="big" :topLeftCorner="false" :bottomRightCorner="false">
      <RouterLink tag="div" :to="{ name: Components.NftDetails, params: { id: contract } }">
        <img :src="nft.img" :alt="nft.meta?.name" loading="lazy" width="240" height="240" />
        <div class="nft-info">
          <div class="titles">
            <span v-if="isNft" class="title">{{ upperTitle }}</span>
            <span class="title title--main">{{ title }}</span>
            <span v-if="isNft" class="title">{{ subTitle }}</span>
          </div>

          <Icon v-if="isNft" icon="export-nft" width="42px" height="42px" class="share" />
        </div>
      </RouterLink>
    </FCorners>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router/composables';
import { RouterLink } from 'vue-router';
import type { FearlessNft } from '@extension-base/services/nft-service/types';
import { Components } from '@/router/routes';

type Props = {
  nft: FearlessNft;
  isNft: boolean;
};

const route = useRoute();
const props = withDefaults(defineProps<Props>(), { isNft: false });
const contract = computed(() => route.params.contract);
const title = ref(props.isNft ? props.nft.meta?.name : props.nft.meta.name);
const subTitle = ref(props.nft.meta.description);
const upperTitle = ref(props.isNft ? props.nft.meta.name : '');
</script>

<style lang="scss" scoped>
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
