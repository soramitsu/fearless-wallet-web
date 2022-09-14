<template>
  <Popup />
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import Popup from '@/components/Popup.vue';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { Networks as NetworksType } from '@/store/networks/types';

@Component({
  components: { Popup },
})
export default class SelectNetworkButton extends Vue {
  @Prop({ default: false }) allNetworks!: boolean;
  @Getter(NetworksGettersTypes.getNetworks) networks!: NetworksType;

  get filteredOptionsNetworks() {
    return 1;
  }
}
</script>
