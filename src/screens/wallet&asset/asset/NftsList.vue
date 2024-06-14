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
import { computed, onMounted, watch } from 'vue';
import type { NetworkJson } from '@extension-base/types';
import type { NftCollection } from '@extension-base/services/nft-service/types';
import NftCollectionItem from '@/screens/wallet&asset/asset/NftCollectionItem.vue';
import { type SelectedWallet, useStore } from '@/store';
import NftSettings from '@/screens/wallet&asset/asset/NftSettings.vue';
import { fetchNfts } from '@/extension/messaging/nfts';
import { isSameString } from '@/helpers';

const emit = defineEmits(['toggleAssetsManagementForm']);
const props = defineProps<{ showAssetsManagementForm: boolean; filterValue: string }>();
const store = useStore();

const selectedNetwork = computed<string>(() => store.getters.selectedNetwork);
const selectedWallet = computed<SelectedWallet>(() => store.getters.selectedWallet);
const nfts = computed<NftCollection[]>(() => store.getters.nfts);
const activeNetworkForSelectedWallet = computed<NetworkJson[]>(() => store.getters.activeNetworkForSelectedWallet);

const filteredNfts = computed(() => {
  return nfts.value.filter(({ network, name }) =>
    activeNetworkForSelectedWallet.value.some((net) => {
      return isSameString(net.name, network) && name?.toLowerCase()?.includes(props.filterValue.toLowerCase());
    })
  );
});

const isEmpty = computed(() => Object.keys(filteredNfts.value).length === 0);
const containerClass = computed(() => (isEmpty.value ? 'no-nfts' : 'nft-list'));

watch([selectedWallet, selectedNetwork], () => setTimeout(() => fetchNfts(selectedWallet.value.ethereumAddress), 2000));

onMounted(() => fetchNfts(selectedWallet.value.ethereumAddress));

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
