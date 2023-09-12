<template>
  <div>
    <div v-if="isEthereumAddress(address)" v-html="getJdenticon(address)"></div>

    <Ident v-else :size="24" theme="polkadot" :value="address" />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Identicon as Ident } from '@polkadot/vue-identicon';
import { toSvg } from 'jdenticon';
import BaseApi from '@/util/BaseApi';

@Component({
  components: { Ident },
})
export default class Identicon extends Vue {
  @Prop(String) address!: string;

  getJdenticon(address: string) {
    return toSvg(address, 24);
  }

  isEthereumAddress(address: string) {
    return BaseApi.isEthereumAddress(address);
  }
}
</script>
