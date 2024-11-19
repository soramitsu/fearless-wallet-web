<template>
  <AboveForm :fullScreen="true" :header="meta.name" @closeHandler="onClose">
    <Scroll>
      <div class="nft-details">
        <div>
          <video v-if="isMp4" :src="imageUrl" autoplay></video>
          <img v-else data-testid="nftImage" :src="imageUrl" :alt="id" width="500" height="500" />

          <div v-if="isOwned" class="icon-ownership" data-testid="iconOwnership">
            <Icon icon="check" className="icon-ownership-size" iconColor="success" width="20px" height="20px" />
          </div>

          <p class="nft-details__desc" data-testid="nftDescription">{{ meta.description }}</p>

          <InfoRow text="nft.collection" data-testid="collection" :value="collection.name" />
          <InfoRow v-if="nft.isOwned" data-testid="owned" text="nft.owned" :value="ownedBy" />
          <InfoRow text="nft.id" data-testid="tokenId" :value="tokenId" />
          <InfoRow text="common.network" data-testid="network" :value="network" />
          <InfoRow text="nft.type" data-testid="type" :value="nft.type" />

          <Tooltip text="common.copied" target=".share" trigger="click" :arrow="true" />
        </div>

        <div class="send-btn">
          <FButton
            text="common.copyMeta"
            iconName="export-nft"
            width="100%"
            size="big"
            class="share"
            data-testid="copyMetadataBtn"
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
            data-testid="sendBtn"
            :border="false"
            @click="onSend"
          />
        </div>
      </div>
    </Scroll>
  </AboveForm>
</template>

<script lang="ts" setup>
import { useRouter, useRoute } from 'vue-router/composables';
import { computed, onMounted } from 'vue';
import type { FearlessNft, NftCollection } from '@extension-base/services/nft-service/types';
import { cut, setClipboard } from '@/helpers';
import { Components } from '@/router/routes';
import { useAccountsStore } from '@/stores/accounts';

const router = useRouter();
const route = useRoute();
const accountsStore = useAccountsStore();

const selectedWallet = computed(() => accountsStore.selectedWallet);
const id = computed(() => route.params.id);
const contract = computed(() => route.params.contract);
const nfts = computed<NftCollection[]>(() => accountsStore.nftsByActiveNetworks ?? {});
const collection = computed<NftCollection>(
  () => nfts.value.find((nft) => nft.address === contract.value) ?? { ownedNfts: [], address: '', network: '' }
);

const nft = computed<Partial<FearlessNft>>(() => {
  const nftCollectionFromStore = accountsStore.availableNfts[contract.value]?.collection ?? [];

  const ownedNfts = collection.value.ownedNfts ?? [];

  return (
    ownedNfts.find((ownedNft) => ownedNft.id === id.value) ??
    nftCollectionFromStore.find((nft) => nft.id === id.value) ??
    {}
  );
});

const network = computed(() => nft.value.network ?? '');

const contentType = computed(() => nft.value.contentType);
const isMp4 = computed(() => contentType.value === 'video/mp4');
const imageUrl = computed(() => nft.value.image ?? require('@/assets/fearless-logo-animated.gif'));

const ownedBy = computed(() => cut(selectedWallet.value.ethereumAddress));
const meta = computed(() => nft.value.meta ?? {});
const tokenId = computed(() => cut(id.value, 5));
const shareBtnType = computed(() => (nft.value.isOwned ? 'thirdly' : 'primary'));
const isOwned = computed(() => !!nft.value.isOwned);
const showSendBtn = computed(() => isOwned.value && !collection.value.isSpam);
const onClose = () => router.back();
const onSend = () => router.push({ name: Components.NftSendForm, params: { id: id.value } });

onMounted(() => {
  if (!Object.keys(nft.value).length) router.push({ name: Components.Nfts });
});

const onShare = () => {
  const dataToShare = {
    'My public address to recieve NFTs:': selectedWallet.value.ethereumAddress,
    collection: contract.value,
    owned: selectedWallet.value.ethereumAddress,
    creator: nft.value.creator,
    network: nft.value.network,
    'token Id': id.value,
    type: nft.value.type,
  };

  setClipboard(JSON.stringify(dataToShare));
};
</script>

<style lang="scss" scoped>
.nft-details {
  position: relative;
  display: flex;
  flex-flow: column;
  justify-content: space-between;
  padding-left: 4px;
  padding-right: 4px;
  height: 100%;

  &__img {
    width: 500px;
    height: 500px;
    margin: 0 auto;
    clip-path: $big-clip-path-left-top-and-right-bottom;
    border-radius: $default-border-radius;
  }

  &__desc {
    font-weight: 400;
    font-size: 0.875em;
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
