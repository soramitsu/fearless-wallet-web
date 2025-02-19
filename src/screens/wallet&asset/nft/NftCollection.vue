<template>
  <AboveForm :fullScreen="true" :header="header" @closeHandler="onClose">
    <InfiniteScroll class="nft-list" :canLoadMore="state.canLoadMore" @onScroll="onScroll">
      <div class="nft-group" data-testid="nftGroupOwned">
        <NftItem
          v-for="nft in ownedNfts"
          data-testid="nftOwned"
          :collectionName="name"
          class="ownedNfts"
          :key="nft.id"
          :nft="nft"
          @share="onShare"
        />
      </div>

      <template v-if="isAvailableNfts">
        <span>{{ additionalNftsHeader }}</span>

        <div class="nft-group" data-testid="nftGroupAvailable">
          <NftItem
            v-for="nft in nftCollectionFromStore"
            data-testid="nftAvailable"
            :collectionName="name"
            :key="nft.id"
            :nft="nft"
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
import { useI18n } from 'vue-i18n-composable';
import type { NftCollection, AvailableNftState, FearlessNft } from '@extension-base/services/nft-service/types';
import { fetchAvailableNftsForContract } from '@/extension/messaging/nfts';
import NftItem from '@/screens/wallet&asset/nft/NftItem.vue';
import Tooltip from '@/components/Tooltip.vue';

import { setClipboard } from '@/helpers';
import { useAccountsStore } from '@/stores/accounts';

const route = useRoute();
const router = useRouter();
const accountsStore = useAccountsStore();

const { t } = useI18n();

const selectedWallet = computed(() => accountsStore.selectedWallet);

const contract = computed(() => route.params.contract);
const availableNftsFromStore = computed<AvailableNftState>(() => accountsStore.availableNfts);
const nftCollectionFromStore = computed<FearlessNft[]>(
  () => availableNftsFromStore.value[contract.value]?.collection ?? []
);
const isAvailableNfts = computed(() => nftCollectionFromStore.value.length);

const state = reactive<{ pageKey?: string; canLoadMore: boolean }>({
  pageKey: availableNftsFromStore.value[contract.value]?.pageKey,
  canLoadMore: true,
});

const tooltip = ref<Tooltip>();

const nfts = computed<NftCollection[]>(() => accountsStore.nftsByActiveNetworks ?? []);
const collection = computed(() => nfts.value.find((el) => el.address === contract.value));
const name = computed(() => collection.value?.name);
const ownedNfts = computed(() => collection.value?.ownedNfts ?? []);

const header = computed(() => (collection.value ? collection.value.name : ''));
const additionalNftsHeader = computed(() => t('nft.availableNfts', { name: collection.value?.name }));
const network = computed<string>(() => collection.value?.network ?? '');

watch(nftCollectionFromStore, () => tooltip.value?.createTooltip());

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

  setClipboard(JSON.stringify(dataToShare));
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
    address: selectedWallet.value.ethereumAddress,
    pageKey: state.pageKey,
  });

  if (nfts.pageKey) state.canLoadMore = true;

  state.pageKey = nfts.pageKey;

  const avNfts: AvailableNftState = {
    [contract.value]: {
      collection: nfts.nfts,
      pageKey: nfts.pageKey,
    },
  };

  accountsStore.setAvailableNfts(avNfts);
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
