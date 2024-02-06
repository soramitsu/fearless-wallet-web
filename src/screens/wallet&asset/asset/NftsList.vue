<template>
  <Scroll>
    <div :class="containerClass">
      <span v-if="isEmpty">{{ $t('nft.noNft') }}</span>
      <template v-else>
        <NftCollectionItem v-for="(nft, i) of filteredNfts" :collection="nft" :key="i" />
      </template>
    </div>

    <NftSettings v-if="showAssetsManagementForm" @handleClose="onClose" />
  </Scroll>
</template>

<script lang="ts" setup>
import { computed, onMounted } from 'vue';
import type { NetworkJson } from '@extension-base/types';
import type { NftCollection } from '@extension-base/services/nft-service/types';
import NftCollectionItem from '@/screens/wallet&asset/asset/NftCollectionItem.vue';
import { type SelectedWallet, useStore } from '@/store';
import NftSettings from '@/screens/wallet&asset/asset/NftSettings.vue';
import { fetchNfts } from '@/extension/messaging/nfts';

const emit = defineEmits(['toggleAssetsManagementForm']);
const props = defineProps<{ showAssetsManagementForm: boolean; filterValue: string }>();
const store = useStore();

const nfts = computed<NftCollection[]>(() => store.getters.nfts);

const activeNetworkForSelectedWallet = computed<NetworkJson[]>(() => store.getters.activeNetworkForSelectedWallet);

const filteredNfts = computed(() =>
  nfts.value.filter(({ network, name }) =>
    activeNetworkForSelectedWallet.value.some((net) => {
      return net.name === network && name?.toLowerCase()?.includes(props.filterValue.toLowerCase());
    })
  )
);
const isEmpty = computed(() => !Object.keys(filteredNfts.value).length);
const containerClass = computed(() => (isEmpty.value ? 'no-nfts' : 'nft-list'));
onMounted(() => {
  const selectedWallet: SelectedWallet = store.getters.selectedWallet;
  fetchNfts(selectedWallet.ethereumAddress);
});
const onClose = () => emit('toggleAssetsManagementForm', false);
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
