<template>
  <Scroll>
    <div :class="containerClass">
      <span v-if="isEmpty" data-testid="noNft">{{ $t('nft.noNft') }}</span>

      <PortfolioNftNetworkSection
        v-for="section in filteredSections"
        v-else
        :key="section.key"
        :section="section"
        :search="filterValue"
      />
    </div>

    <NftSettings v-if="showAssetsManagementForm" @handleClose="onClose" />
  </Scroll>
</template>

<script lang="ts" setup>
import { computed, onMounted, watch } from 'vue';
import PortfolioNftNetworkSection from '@/screens/wallet&asset/nft/PortfolioNftNetworkSection.vue';
import NftSettings from '@/screens/wallet&asset/nft/NftSettings.vue';
import { fetchNfts } from '@/extension/messaging/nfts';
import { buildNftNetworkSections } from '@/portfolio/nftIdentity';
import { ALL_NETWORKS, FAVORITE_NETWORKS, POPULAR_NETWORKS } from '@/consts/networks';
import { isSameString } from '@/helpers';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

const emit = defineEmits(['toggleAssetsManagementForm']);
const props = defineProps<{ showAssetsManagementForm: boolean; filterValue: string }>();
const accountsStore = useAccountsStore();
const networksStore = useNetworksStore();

const selectedWallet = computed(() => accountsStore.selectedWallet);
const sections = computed(() =>
  buildNftNetworkSections({
    nfts: accountsStore.nfts,
    networks: networksStore.allNetworks,
    address: selectedWallet.value.ethereumAddress,
  })
);

const filteredSections = computed(() => {
  const selected = accountsStore.selectedNetwork;
  const search = props.filterValue.trim().toLowerCase();
  let values = sections.value;

  if (selected === POPULAR_NETWORKS) {
    values = values.filter((section) => networksStore.getNetwork(section.chainId)?.rank !== undefined);
  } else if (selected === FAVORITE_NETWORKS) {
    values = values.filter((section) =>
      networksStore.getNetwork(section.chainId)?.favorite.includes(selectedWallet.value.address)
    );
  } else if (!isSameString(selected, ALL_NETWORKS)) {
    values = values.filter((section) => isSameString(section.name, selected));
  }

  if (!search) return values;

  return values.filter(
    (section) =>
      section.name.toLowerCase().includes(search) ||
      section.collections.some((collection) =>
        `${collection.name ?? ''} ${collection.address}`.toLowerCase().includes(search)
      )
  );
});

const isEmpty = computed(() => filteredSections.value.length === 0);
const containerClass = computed(() => (isEmpty.value ? 'no-nfts' : 'nft-list'));

watch(
  () => selectedWallet.value.ethereumAddress,
  (address) => {
    if (address) setTimeout(() => fetchNfts(address), 2000);
  }
);

onMounted(() => {
  if (selectedWallet.value.ethereumAddress) fetchNfts(selectedWallet.value.ethereumAddress);
});

const onClose = () => emit('toggleAssetsManagementForm', false);
</script>

<style lang="scss" scoped>
.nft-list {
  display: block;
  height: 100%;
}

.no-nfts {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  color: $grayish-white;
  font-size: 1em;
  font-weight: 400;
}
</style>
