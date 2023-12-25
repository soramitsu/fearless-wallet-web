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
import { computed } from 'vue';
import type { NftState } from '@extension-base/services/nft-service/types';
import NftCollectionItem from '@/screens/wallet&asset/asset/NftCollectionItem.vue';
import { useStore } from '@/store';

const store = useStore();
const nfts = computed<NftState>(() => store.getters.getNfts);
const isEmpty = computed(() => !Object.keys(nfts.value).length);
const containerClass = computed(() => (isEmpty.value ? 'no-nfts' : 'nft-list'));
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
