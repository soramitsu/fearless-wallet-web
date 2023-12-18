<template>
  <Scroll>
    <div class="nft-list">
      <NftCollectionItem v-for="(nft, i) of nfts" :nft="nft" :key="i" />
    </div>
    <!-- <div v-else class="no-nfts">
      <span>{{ 'There is no nfts, yet' }}</span>
    </div> -->
  </Scroll>
</template>

<script lang="ts" setup>
import { onMounted, ref } from 'vue';

// import { useStore } from '@/store';`
import type { NftState } from '@extension-base/services/nft-service/types';
import { getNftSubscribe } from '@/extension/messaging/nfts';
import NftCollectionItem from '@/screens/wallet&asset/asset/NftCollectionItem.vue';

// const store = useStore();
const nfts = ref<NftState>({});

onMounted(async () => {
  const ownedNfts = await getNftSubscribe((data) => {
    nfts.value = data;
  });

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
}
</style>
