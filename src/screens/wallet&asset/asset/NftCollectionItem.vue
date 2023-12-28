<template>
  <FCorners size="big" :topLeftCorner="false" :bottomRightCorner="false">
    <div class="nft" @click="onClick">
      <img :src="nft.image" :alt="nft?.name" loading="lazy" width="240" height="240" />
      <div class="nft-info">
        <span class="title title--main">{{ title }}</span>
      </div>
    </div>
  </FCorners>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import { type NftCollection } from '@extension-base/services/nft-service/types';
import { useRouter } from 'vue-router/composables';
import { Components } from '@/router/routes';

type Props = {
  nft: NftCollection;
};

const props = defineProps<Props>();
const router = useRouter();
const title = ref(props.nft?.name);

const onClick = () => {
  router.push({ name: Components.NftCollection, params: { contract: props.nft.address } });
};
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
