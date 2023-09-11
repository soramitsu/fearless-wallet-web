<template>
  <div>
    <div v-if="isEthereumAddress(address)" v-html="getJdenticon(address)"></div>

    <Ident v-else :size="24" theme="polkadot" :value="address" />
  </div>
</template>

<script lang="ts" setup>
import { toSvg } from 'jdenticon';
import { Identicon as Ident } from '@polkadot/vue-identicon';
import BaseApi from '@/util/BaseApi';

defineProps<{ address: string }>();

const getJdenticon = (address: string) => toSvg(address, 24);
const isEthereumAddress = (address: string) => BaseApi.isEthereumAddress(address);
</script>
