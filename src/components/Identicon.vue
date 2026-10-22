<template>
  <div class="identicon">
    <Ident v-if="!address || isSubstrateAddress(address)" :size="24" :address="address" />

    <img v-else :src="getJdenticon(address)" alt="" width="24" height="24" />
  </div>
</template>

<script lang="ts" setup>
import { toSvg } from 'jdenticon';
import { isAddress } from '@polkadot/util-crypto';
import { Polkadot as Ident } from '@polkadot/vue-identicon/icons/Polkadot';
import BaseApi from '@/util/BaseApi';

withDefaults(defineProps<{ address: string }>(), {
  address: '',
});

const getJdenticon = (address: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(toSvg(address, 24))}`;
// The Polkadot identicon draws only SS58 accounts (and accepts raw hex), so EVM, Bitcoin and Iroha
// addresses get a jdenticon instead of a blank circle.
const isSubstrateAddress = (address: string) => !BaseApi.isEthereumAddress(address) && isAddress(address);
</script>

<style lang="scss" scoped>
.identicon {
  display: flex;
}
</style>
