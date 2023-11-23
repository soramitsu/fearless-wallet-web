<template>
  <Scroll>
    <div v-if="nfts.length" class="nft-list">
      <NftItem v-for="(nft, i) in nfts" :nft="nft" :key="i" />
    </div>
    <div v-else class="no-nfts">
      <span>{{ 'There is no nfts, yet' }}</span>
    </div>
  </Scroll>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import type { OwnedNft } from 'alchemy-sdk';
import { useStore } from '@/store';
import { getNfts } from '@/extension/messaging/nfts';
import NftItem from '@/screens/wallet&asset/asset/NftItem.vue';

const store = useStore();
const selectedWallet = computed(() => store.getters.selectedWallet);
const nfts = ref<OwnedNft[]>([]);

onMounted(async () => {
  const res = await getNfts(selectedWallet.value.ethereumAddress);
  if (res) nfts.value = res.ownedNfts;
});
</script>
<style lang="scss">
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
