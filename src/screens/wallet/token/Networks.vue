<template>
  <div class="networks">
    <NetworkItem
      v-for="{ network, balance } in networks"
      :key="network"
      :network="network"
      :balance="balance"
      :token="token"
      :isActive="selectedNetwork === network"
    />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import NetworkItem from './NetworkItem.vue';

@Component({
  components: {
    NetworkItem,
  },
})
export default class extends Vue {
  @Prop(Array) networks!: [];
  @Prop(String) token!: string;
  @Prop(String) selectedNetwork!: string;
}
</script>

<style lang="scss" scoped>
.networks {
}
</style>
