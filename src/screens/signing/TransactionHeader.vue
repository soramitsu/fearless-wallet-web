<template>
  <Corners>
    <h2>Wallet</h2>
    <span>public key</span>
    <span>network</span>
  </Corners>
</template>

<script>
import { Vue, Component } from 'vue-property-decorator';
import Corners from '@/components/Corners.vue';
@Component({
  components: {
    Corners,
  },
})
export default class TransactionHeader extends Vue {}
</script>

<style></style>
