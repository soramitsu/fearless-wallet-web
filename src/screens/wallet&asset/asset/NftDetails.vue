<template>
  <AboveForm :fullScreen="true" header="accounts.newNode" showBackIcon @closeHandler="onBack" @handlerBack="onBack">
    <Scroll>
      <div class="nft-details">
        <img :src="nft?.img" class="nft-details__img" :alt="nft?.id" width="500" height="500" />
        <p>{{ description }}</p>

        <InfoRow text="nft.owned" :value="owned" />
        <InfoRow text="nft.id" :value="id" />
        <InfoRow text="common.network" :value="contractAdress" />
        <InfoRow text="nft.type" :value="type" />
        <FButton class="send-btn" text="common.send" width="100%" size="big" fontSize="big" />
      </div>
    </Scroll>
  </AboveForm>
</template>

<script lang="ts" setup>
import { type FearlessNft } from '@extension-base/services/nft-service/types';
import { useRouter } from 'vue-router/composables';
import { computed } from 'vue';
import { cut } from '@/helpers';

type Props = {
  address: string;
  nft: FearlessNft;
};

const props = defineProps<Props>();
const router = useRouter();

const description = computed(() => props.nft.meta.name);
const id = computed(() => props.nft.id);
const type = computed(() => props.nft.type);
const contractAdress = computed(() => props.address);
const owned = computed(() => cut(props.address, 5));

const onBack = () => {
  router.back();
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
  }
}
.send-btn {
  width: 100%;
  position: sticky;
  bottom: 0;
}
</style>
