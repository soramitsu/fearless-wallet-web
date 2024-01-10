<template>
  <AboveForm :fullScreen="true" :header="meta.name" showBackIcon @closeHandler="onBack" @handlerBack="onBack">
    <Scroll>
      <div class="nft-details">
        <img v-if="img" :src="img" class="nft-details__img" :alt="id" width="500" height="500" />
        <p>{{ meta.description }}</p>

        <InfoRow text="nft.owned" :value="owned" />
        <InfoRow text="nft.id" :value="tokenId" />
        <InfoRow text="common.network" :value="meta.address" />
        <InfoRow text="nft.type" :value="type" />
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
import { cut } from '@/helpers';

const router = useRouter();
const route = useRoute();
const store = useStore();
const id = computed(() => route.params.id);
const nfts = computed<NftState>(() => store.getters.nfts ?? []);
const contract = computed(() => route.params.contract);
const collections = computed(() => nfts.value[contract.value]);
const ownedNfts = computed(() => collections.value?.ownedNfts ?? []);
const nft = computed(() => ownedNfts.value.find((nft) => nft.id === id.value)!);
const img = computed(() => nft.value?.img);
const owned = computed(() => (nft.value?.isOwned ? 'owned' : 'not owned'));
const meta = computed(() => nft.value?.meta ?? {});
const type = computed(() => nft.value?.type);
const tokenId = computed(() => cut(route.params.id, 5));

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
