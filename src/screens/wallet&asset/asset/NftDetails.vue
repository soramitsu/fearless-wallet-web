<template>
  <AboveForm :fullScreen="true" :header="meta.name" showBackIcon @closeHandler="onBack" @handlerBack="onBack">
    <Scroll>
      <div class="nft-details">
        <img v-if="image" :src="image" class="nft-details__img" :alt="id" width="500" height="500" />
        <p class="nft-details__desc">{{ meta.description }}</p>

        <InfoRow text="nft.owned" :value="owned" />
        <InfoRow text="nft.id" :value="tokenId" />
        <InfoRow text="common.network" :value="meta.address" />
        <InfoRow text="nft.type" :value="type" />

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
            v-if="isOwned"
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
import { computed } from 'vue';
import type { FearlessNft, NftState } from '@extension-base/services/nft-service/types';
import { type SelectedWallet, useStore } from '@/store';
import { cut } from '@/helpers';
import { Components } from '@/router/routes';

const router = useRouter();
const route = useRoute();
const store = useStore();

const id = computed(() => route.params.id);
const nfts = computed<NftState>(() => store.getters.nfts ?? []);
const contract = computed(() => route.params.contract);
const ownedNfts = computed<FearlessNft[]>(() => nfts.value[contract.value]?.ownedNfts ?? []);
ownedNfts;
const nft = computed(() => ownedNfts.value.find((nft) => nft.id === id.value)!);
const image = computed(() => nft.value?.image);
const owned = computed(() => (nft.value?.isOwned ? 'owned' : 'not owned'));
const isOwned = computed(() => nft.value?.isOwned);
const meta = computed(() => nft.value?.meta ?? {});
const type = computed(() => nft.value?.type);
const tokenId = computed(() => cut(route.params.id, 5));
const shareBtnType = computed(() => (isOwned.value ? 'secondary' : 'primary'));
const selectedWallet = computed<SelectedWallet>(() => store.getters.selectedWallet);

const onBack = () => router.back();
const onSend = () => router.push({ name: Components.NftSendForm, params: { id: id.value } });

const onShare = () => {
  const dataToShare = {
    'My public address to recieve NFTs:': selectedWallet.value.ethereumAddress,
    collection: contract.value,
    owned: selectedWallet.value.ethereumAddress,
    creator: nft.value.creator,
    network: nft.value.network,
    'token Id': route.params.id,
    type: type.value,
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
  }

  &__desc {
    font-weight: 400;
    font-size: 14px;
    padding-top: 20px;
    padding-bottom: 20px;
    color: $default-white;
    overflow-wrap: anywhere;
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
