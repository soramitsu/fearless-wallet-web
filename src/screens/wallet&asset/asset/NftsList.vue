<template>
  <Scroll>
    <div :class="containerClass">
      <span v-if="isEmpty">{{ $t('nft.noNft') }}</span>
      <template v-else>
        <NftCollectionItem v-for="(nft, i) of filteredNfts" :nft="nft" :key="i" />
      </template>
    </div>

    <NftSettings v-if="showAssetsManagementForm" @handleClose="onClose" />
  </Scroll>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import type { NftState } from '@extension-base/services/nft-service/types';
import NftCollectionItem from '@/screens/wallet&asset/asset/NftCollectionItem.vue';
import { useStore } from '@/store';
import NftSettings from '@/screens/wallet&asset/asset/NftSettings.vue';
import { type NetworkJson } from '@/extension/background/extension-base/src/types';

const emit = defineEmits(['toggleAssetsManagementForm']);
defineProps<{ showAssetsManagementForm: boolean }>();
const store = useStore();

const nfts = computed<NftState>(() => store.getters.nfts);
const activeNetworkForSelectedWallet = computed<NetworkJson[]>(() => store.getters.activeNetworkForSelectedWallet);

const filteredNfts = computed(() =>
  Object.values(nfts.value).filter(({ network }) =>
    activeNetworkForSelectedWallet.value.some(({ name }) => name === network)
  )
);
const isEmpty = computed(() => !Object.keys(filteredNfts.value).length);
const containerClass = computed(() => (isEmpty.value ? 'no-nfts' : 'nft-list'));

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
