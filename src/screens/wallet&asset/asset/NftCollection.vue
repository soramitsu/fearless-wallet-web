<template>
  <AboveForm :fullScreen="true" :header="collections.name" @closeHandler="onClose">
    <Scroll>
      <div class="nft-list">
        <NftItem v-for="(nft, index) in ownedNfts" :key="index" :nft="nft" isNft />
      </div>
    </Scroll>
  </AboveForm>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router/composables';
import { type NftState } from '@extension-base/services/nft-service/types';
import { useStore } from '@/store';
import NftItem from '@/screens/wallet&asset/asset/NftItem.vue';
const route = useRoute();
const router = useRouter();
const store = useStore();
const nfts = computed<NftState>(() => store.getters.nfts ?? []);
const contract = computed(() => route.params.contract);
const collections = computed(() => nfts.value[contract.value]);
const ownedNfts = computed(() => collections.value?.ownedNfts ?? []);
const onClose = () => router.back();
</script>

<style lang="scss" scoped>
.nft-list {
  display: flex;
  gap: 10px;
}
</style>
