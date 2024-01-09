<template>
  <AboveForm :fullScreen="true" header="accounts.newNode" showBackIcon @closeHandler="onBack" @handlerBack="onBack">
    <Scroll>
      <div class="nft-details">
        <img :src="nft.img" class="nft-details__img" :alt="nft?.id" width="500" height="500" />
        <p>{{ nft.meta.description }}</p>

        <InfoRow text="nft.owned" :value="nft.isOwned" />
        <InfoRow text="nft.id" :value="id" />
        <InfoRow text="common.network" :value="nft.meta.address" />
        <InfoRow text="nft.type" :value="nft.type" />
        <FButton class="send-btn" text="common.send" width="100%" size="big" fontSize="big" />
      </div>
    </Scroll>
  </AboveForm>
</template>

<script lang="ts" setup>
import { type NftState } from '@extension-base/services/nft-service/types';
import { useRouter, useRoute } from 'vue-router/composables';
import { computed } from 'vue';
import { useStore } from '@/store';

const router = useRouter();
const route = useRoute();
const store = useStore();
const id = computed(() => route.params.id);
const nfts = computed<NftState>(() => store.getters.nfts ?? []);
const contract = computed(() => route.params.contract);
const collections = computed(() => nfts.value[contract.value]);
const ownedNfts = computed(() => collections.value?.ownedNfts ?? []);
const nft = computed(() => ownedNfts.value.find((nft) => nft.id === id.value)!);

const onBack = () => router.back();
</script>

<style lang="scss" scoped>
.nft-details {
  position: relative;
  display: flex;
  flex-flow: column;
  padding-left: 4px;
  padding-right: 4px;

  &__img {
    width: 500px;
    height: 500px;
    margin: 0 auto;
  }

  &__desc {
    font-weight: 400;
    font-size: 14px;
  }
}
.send-btn {
  width: 100%;
  position: sticky;
  bottom: 0;
}
</style>
