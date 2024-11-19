<template>
  <Scroll>
    <div :class="containerClass">
      <span v-if="isEmpty" data-testid="noNft">{{ $t('nft.noNft') }}</span>

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
import NftCollectionItem from '@/screens/wallet&asset/nft/NftCollectionItem.vue';
import NftSettings from '@/screens/wallet&asset/nft/NftSettings.vue';
import { fetchNfts } from '@/extension/messaging/nfts';
import { isSameString } from '@/helpers';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

const emit = defineEmits(['toggleAssetsManagementForm']);
const props = defineProps<{ showAssetsManagementForm: boolean; filterValue: string }>();
const accountsStore = useAccountsStore();
const networksStore = useNetworksStore();

const selectedNetwork = computed(() => accountsStore.selectedNetwork);
const selectedWallet = computed(() => accountsStore.selectedWallet);
const nfts = computed<NftCollection[]>(() => accountsStore.nftsByActiveNetworks);
const activeNetworkForSelectedWallet = computed<NetworkJson[]>(() => networksStore.activeNetworkForSelectedWallet);

const filteredNfts = computed(() => {
  return nfts.value.filter(({ network, name }) => {
    const filterValue = props.filterValue.toLowerCase();

    if (!name?.toLowerCase().includes(filterValue)) return false;

    return activeNetworkForSelectedWallet.value.some((net) => isSameString(net.name, network));
  });
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
