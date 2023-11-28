<template>
  <AboveForm :fullScreen="true" header="accounts.newNode" showBackIcon @closeHandler="onBack" @handlerBack="onBack">
    <Scroll>
      <div class="nft-details">
        <img
          src="https://nft-cdn.alchemy.com/eth-mainnet/7d6df468f05a22d24b2452442f443fb8"
          class="nft-details__img"
          width="500"
          height="500"
        />
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
import { cut } from '@/helpers';

type Props = {
  nft?: FearlessNft;
};

defineProps<Props>();
const description =
  'Alako is DozerFriends’ super sleepy purple koala bear, dressed ready for a nap at any time. He’s just so tired…';
const id = '';
const type = 'erc-721';
const contractAdress = 'f4342432';
const owned = cut('0x34242342rdscsdfsdfdwr3243434', 5);
const router = useRouter();

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
