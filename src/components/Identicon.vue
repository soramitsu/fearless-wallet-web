<template>
  <div class="identicon">
    <img v-if="isEthereumAddress(address)" :src="getJdenticon(address)" alt="" width="24" height="24" />

    <Ident v-else :size="24" :address="address" />
  </div>
</template>

<script lang="ts" setup>
import { toSvg } from 'jdenticon';
import { Polkadot as Ident } from '@polkadot/vue-identicon/icons/Polkadot';
import BaseApi from '@/util/BaseApi';

withDefaults(defineProps<{ address: string }>(), {
  address: '',
});

const getJdenticon = (address: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(toSvg(address, 24))}`;
const isEthereumAddress = (address: string) => BaseApi.isEthereumAddress(address);
</script>

<style lang="scss" scoped>
.identicon {
  display: flex;
}
</style>
