<template>
  <Scroll>
    <div class="nft-list">
      <NftItem v-for="(nft, i) in nfts" :nft="nft" :key="i" />
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
  height: 100%;
  display: grid;
  gap: 16px;
  flex-flow: row wrap;
  grid-template-columns: max-content max-content;
}
</style>
