<template>
  <div class="networks">
    <NetworkItem
      v-for="{ network, totalCountTokens } in networks"
      :key="network"
      :network="network"
      :totalCountTokens="totalCountTokens"
      :token="token"
      :isActive="selectedNetwork === network"
    />
  </div>
</template>

<script lang="ts">
import NetworkItem from './NetworkItem.vue';
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component({
  components: {
    NetworkItem,
  },
})
export default class Networks extends Vue {
  @Prop(Array) networks!: [];
  @Prop(String) token!: string;
  @Prop(String) selectedNetwork!: string;
}
</script>

<style lang="scss" scoped>
.networks {
}
</style>
