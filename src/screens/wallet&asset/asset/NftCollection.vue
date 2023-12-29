<template>
  <AboveForm fullScreen header="accounts.newNode">
    <NftItem v-for="(nft, index) in ownedNfts" :key="index" :nft="nft" isNft />
  </AboveForm>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router/composables';
import { type NftState } from '@extension-base/services/nft-service/types';
import { useStore } from '@/store';
import NftItem from '@/screens/wallet&asset/asset/NftItem.vue';
const route = useRoute();
// const router = useRouter();

const store = useStore();
const nfts = computed<NftState>(() => store.getters.nfts ?? []);
const contract = computed(() => route.params.contract);
const collections = computed(() => nfts.value[contract.value]);
const ownedNfts = computed(() => {
  return collections.value?.ownedNfts ?? [];
});
</script>

<style lang="scss" scoped></style>
