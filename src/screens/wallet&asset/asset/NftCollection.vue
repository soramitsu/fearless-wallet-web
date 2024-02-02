<template>
  <AboveForm :fullScreen="true" :header="header" @closeHandler="onClose">
    <InfiniteScroll class="nft-list" :canLoadMore="state.canLoadMore" @onScroll="onScroll">
      <div class="nft-group">
        <NftItem
          v-for="nft in ownedNfts"
          :collectionName="collection.name"
          class="ownedNfts"
          :key="nft.id"
          :nft="nft"
          isNft
          @share="onShare"
        />
      </div>

      <template v-if="isAvailableNfts">
        <span>{{ additionalNftsHeader }}</span>

        <div class="nft-group">
          <NftItem
            v-for="nft in availableNfts"
            :collectionName="collection.name"
            :key="nft.id"
            :nft="nft"
            isNft
            @share="onShare"
          />
        </div>

        <Tooltip ref="tooltip" text="common.copied" target=".share" trigger="click" arrow />
      </template>
    </InfiniteScroll>
  </AboveForm>
</template>

<script lang="ts" setup>
import { computed, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router/composables';
import { type AvailableNftState, type FearlessNft, type NftState } from '@extension-base/services/nft-service/types';
import { useI18n } from 'vue-i18n-composable';
import { fetchAvailableNftsForContract } from '@/extension/messaging/nfts';
import { type SelectedWallet, useStore } from '@/store';
import NftItem from '@/screens/wallet&asset/asset/NftItem.vue';
import InfiniteScroll from '@/components/InfiniteScroll.vue';
import Tooltip from '@/components/Tooltip.vue';

const route = useRoute();
const router = useRouter();
const store = useStore();
const { t } = useI18n();

const contract = computed(() => route.params.contract);
const availableNftsFromStore = computed<AvailableNftState>(() => store.getters.availableNfts);
const nftCollectionFromStore = computed<FearlessNft[]>(() => {
  const availableNfts = store.getters.availableNfts;
  if (availableNfts[contract.value]) return availableNfts[contract.value].collection;

  return [];
});
const state = reactive<{ pageKey?: string; canLoadMore: boolean }>({
  pageKey: availableNftsFromStore.value[contract.value]?.pageKey,
  canLoadMore: true,
});
const tooltip = ref<Tooltip>();
const nfts = computed<NftState>(() => store.getters.nfts ?? []);
const collection = computed(() => nfts.value[contract.value]);
const ownedNfts = computed(() => collection.value?.ownedNfts ?? []);
const availableNfts = ref<FearlessNft[]>(nftCollectionFromStore.value);
const isAvailableNfts = computed(() => availableNfts.value.length);
watch(availableNfts, () => {
  tooltip.value?.createTooltip();
});
const header = computed(() => (collection.value ? collection.value.name : ''));
const additionalNftsHeader = computed(() => t('nft.availableNfts', { name: collection.value.name }));
const network = computed<string>(() => {
  if (collection.value) {
    return collection.value.network;
  }

  return '';
});
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

const onScroll = async () => {
  state.canLoadMore = false;

  if (!network.value) {
    state.canLoadMore = true;

    return;
  }

  const nfts = await fetchAvailableNftsForContract({
    contract: contract.value,
    network: network.value,
    pageKey: state.pageKey,
  });

  if (nfts.pageKey) state.canLoadMore = true;

  state.pageKey = nfts.pageKey;
  availableNfts.value.push(...nfts.nfts);
  const avNfts: AvailableNftState = {};

  avNfts[contract.value] = {
    collection: nfts.nfts,
    pageKey: nfts.pageKey,
  };

  store.commit('SET_AVAILABLE_NFTS', avNfts);
};
</script>

<style lang="scss" scoped>
.nft-list {
  display: flex;
  gap: 15px;
  flex-flow: column;
  align-items: self-start;

  .nft-group {
    display: flex;
    flex-flow: row wrap;
    gap: 15px;
  }
}

.ownedNfts {
  margin-right: auto;
}
</style>
