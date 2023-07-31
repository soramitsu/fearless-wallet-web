<template>
  <div>
    <div v-if="isEthereumAddress(address)" v-html="getJdenticon(address)"></div>

    <Identicon v-else :size="24" theme="polkadot" :value="address" />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Identicon } from '@polkadot/vue-identicon';
import { toSvg } from 'jdenticon';
import BaseApi from '@/util/BaseApi';

@Component({
  components: { Identicon },
})
export default class HistoryBook extends Vue {
  @Prop(String) address!: string;

  getJdenticon(address: string) {
    return toSvg(address, 24);
  }

  isEthereumAddress(address: string) {
    return BaseApi.isEthereumAddress(address);
  }
}
</script>
