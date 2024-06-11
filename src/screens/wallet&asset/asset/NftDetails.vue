<template>
  <AboveForm :fullScreen="true" :header="meta.name" showBackIcon @closeHandler="onBack" @handlerBack="onBack">
    <Scroll>
      <div class="nft-details">
        <img :src="image" class="nft-details__img" :alt="id" width="500" height="500" />

        <div v-if="isOwned" class="icon-ownership">
          <Icon icon="check" className="icon-ownership-size" iconColor="success" width="20px" height="20px" />
        </div>

        <p class="nft-details__desc">{{ meta.description }}</p>

        <InfoRow text="nft.collection" :value="collection.name" />
        <InfoRow v-if="nft.isOwned" text="nft.owned" :value="ownedBy" />
        <InfoRow text="nft.id" :value="tokenId" />
        <InfoRow text="common.network" :value="network" />
        <InfoRow text="nft.type" :value="nft.type" />

        <div class="send-btn">
          <FButton
            text="common.copyMeta"
            iconName="export-nft"
            width="100%"
            size="big"
            class="share"
            :type="shareBtnType"
            fontSize="big"
            :border="false"
            :hover="false"
            @click="onShare"
          />

          <FButton
            v-if="showSendBtn"
            iconName="telegram"
            text="common.send"
            width="100%"
            size="big"
            fontSize="big"
            :border="false"
            @click="onSend"
          />
          <Tooltip text="common.copied" target=".share" trigger="click" arrow />
        </div>
      </div>
    </Scroll>
  </AboveForm>
</template>

<script lang="ts" setup>
import { useRouter, useRoute } from 'vue-router/composables';
import { computed, onMounted } from 'vue';
import type { FearlessNft, NftCollection } from '@extension-base/services/nft-service/types';
import { type SelectedWallet, useStore } from '@/store';
import { cut } from '@/helpers';
import { Components } from '@/router/routes';

const router = useRouter();
const route = useRoute();
const store = useStore();
const selectedWallet = computed<SelectedWallet>(() => store.getters.selectedWallet);
const id = computed(() => route.params.id);
const contract = computed(() => route.params.contract);
const nfts = computed<NftCollection[]>(() => store.getters.nfts ?? {});
const collection = computed<NftCollection>(
  () => nfts.value.find((nft) => nft.address === contract.value) ?? { ownedNfts: [], address: '', network: '' }
);

const nft = computed<Partial<FearlessNft>>(() => {
  const nftCollectionFromStore: FearlessNft[] = store.getters.availableNfts[contract.value]?.collection ?? [];
  const ownedNfts: FearlessNft[] = [...collection.value.ownedNfts] ?? [];

  return (
    ownedNfts.find((ownedNft) => ownedNft.id === id.value) ??
    nftCollectionFromStore.find((nft) => nft.id === id.value) ??
    {}
  );
});

const network = computed(() => nft.value.network ?? '');
const image = computed(() => nft.value.image ?? require('@/assets/fearless-logo-animated.gif'));
const ownedBy = computed(() => cut(selectedWallet.value.ethereumAddress));
const meta = computed(() => nft.value.meta ?? {});
const tokenId = computed(() => cut(id.value, 5));
const shareBtnType = computed(() => (nft.value.isOwned ? 'thirdly' : 'primary'));
const isOwned = computed(() => !!nft.value.isOwned);
const showSendBtn = computed(() => isOwned.value && !collection.value.isSpam);
const onBack = () => router.back();
const onSend = () => router.push({ name: Components.NftSendForm, params: { id: id.value } });
onMounted(() => {
  if (!Object.keys(nft.value).length) router.push({ name: Components.Nfts });
});

const onShare = () => {
  const selectedWallet: SelectedWallet = store.getters.selectedWallet;
  const dataToShare = {
    'My public address to recieve NFTs:': selectedWallet.ethereumAddress,
    collection: contract.value,
    owned: selectedWallet.ethereumAddress,
    creator: nft.value.creator,
    network: nft.value.network,
    'token Id': id.value,
    type: nft.value.type,
  };

  navigator.clipboard.writeText(JSON.stringify(dataToShare));
};
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
    clip-path: $big-clip-path-left-top-and-right-bottom;
    border-radius: $default-border-radius;
  }

  &__desc {
    font-weight: 400;
    font-size: 14px;
    padding: 15px 0;
    color: $default-white;
    overflow-wrap: anywhere;
  }
  .icon-ownership {
    background-color: #000000b2;
    border-radius: 50%;
    padding: 10px;
    position: absolute;
    cursor: auto;
    pointer-events: none;
    right: 17px;
    top: 5px;
    width: 40px;
    height: 40px;

    &-size {
      width: 20px;
      height: 20px;
    }
  }
}
.send-btn {
  width: 100%;
  position: sticky;
  bottom: 0;
  display: flex;
  gap: 5px;
}
</style>
