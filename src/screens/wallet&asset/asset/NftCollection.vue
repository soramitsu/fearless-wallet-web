<template>
  <AboveForm :fullScreen="true" :header="header" @closeHandler="onClose">
    <Scroll>
      <div class="nft-list">
        <NftItem
          v-for="(nft, index) in ownedNfts"
          :collectionName="collection.name"
          :key="index"
          :nft="nft"
          isNft
          @share="onShare"
        />
        <Tooltip text="common.copied" target=".share" trigger="click" arrow />
      </div>
    </Scroll>
  </AboveForm>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router/composables';
import { type FearlessNft, type NftState } from '@extension-base/services/nft-service/types';
import { type SelectedWallet, useStore } from '@/store';
import NftItem from '@/screens/wallet&asset/asset/NftItem.vue';

const route = useRoute();
const router = useRouter();
const store = useStore();

const nfts = computed<NftState>(() => store.getters.nfts ?? []);
const contract = computed(() => route.params.contract);
const collection = computed(() => nfts.value[contract.value]);
const header = computed(() => (collection.value ? collection.value.name : ''));
const ownedNfts = computed(() => collection.value?.ownedNfts ?? []);
const selectedWallet = computed<SelectedWallet>(() => store.getters.selectedWallet);

const onClose = () => router.back();

function onShare(nft: FearlessNft) {
  const dataToShare = {
    'My public address to recieve:': selectedWallet.value.ethereumAddress,
    collection: contract.value,
    owned: nft.ownedBy,
    creator: nft.creator,
    network: nft.network,
    'token Id': nft.id,
    type: nft.type,
  };

  navigator.clipboard.writeText(JSON.stringify(dataToShare));
}
</script>

<style lang="scss" scoped>
.nft-list {
  display: flex;
  gap: 10px;
}
</style>
