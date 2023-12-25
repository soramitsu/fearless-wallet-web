<template>
  <Scroll>
    <div :class="containerClass">
      <span v-if="isEmpty">{{ $t('nft.noNft') }}</span>
      <template v-else>
        <NftCollectionItem v-for="(nft, i) of nfts" :nft="nft" :key="i" />
      </template>
    </div>
  </Scroll>
</template>

<script lang="ts" setup>
import { onMounted, ref, computed } from 'vue';

// import { useStore } from '@/store';`
import type { NftState } from '@extension-base/services/nft-service/types';
import { getNftSubscribe } from '@/extension/messaging/nfts';
import NftCollectionItem from '@/screens/wallet&asset/asset/NftCollectionItem.vue';

// const store = useStore();
const nfts = ref<NftState>({});
const isEmpty = computed(() => !Object.keys(nfts.value).length);
const containerClass = computed(() => (isEmpty.value ? 'no-nfts' : 'nft-list'));
onMounted(async () => {
  const ownedNfts = await getNftSubscribe((data) => (nfts.value = data));
  nfts.value = ownedNfts;
});
</script>

<style lang="scss" scoped>
.nft-list {
  display: grid;
  grid-template-columns: max-content max-content;
  gap: 16px;
  height: 100%;
}

.no-nfts {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  color: $grayish-white;
  font-size: 16px;
  font-weight: 400;
}
</style>
