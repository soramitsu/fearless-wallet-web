<template>
  <AboveForm>
    <template>
      <InputWithIcon
        v-model="originNetwork"
        class="row"
        icon="rotate"
        :placeholder="placeholderNetwork"
        :isActiveRotate="showSelectNetworkPopup"
        @click="toggleValue('showSelectNetworkPopup')"
      />
      <InputWithIcon
        v-model="recipientCut"
        class="row"
        icon="close"
        placeholder="assets.sendTo"
        @click="setRecipient"
      />

      <div class="activity-buttons row">
        <BadgeButton text="assets.history" @click="toggleHistoryBookVisibility" />

        <BadgeButton text="common.paste" @click="paste" />

        <BadgeButton text="assets.myWallets" @click="toggleMyWalletsVisibility" />
      </div>
    </template>
  </AboveForm>
</template>
<script lang="ts" setup>
import { ref } from 'vue';
import BaseApi from '@/util/BaseApi';

const recipientCut = ref('');
const originNetwork = ref('');

const setRecipient = (address = '') => {
  this.syncedRecipient = BaseApi.formatAddress({ address, ethereumAddress: address }, this.targetNetwork);
};
</script>

<style></style>
