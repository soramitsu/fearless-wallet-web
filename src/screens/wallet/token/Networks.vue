<template>
  <div class="networks">
    <NetworkItem v-for="networkName in availableInNetworks" :key="networkName" :networkName="networkName" />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import Scroll from '../../../components/Scroll.vue';
import NetworkItem from './NetworkItem.vue';

@Component({
  components: {
    Scroll,
    NetworkItem,
  },
})
export default class extends Vue {
  @Prop(Array) availableInNetworks!: [];
}
</script>

<style lang="scss" scoped>
.networks {
}
</style>
