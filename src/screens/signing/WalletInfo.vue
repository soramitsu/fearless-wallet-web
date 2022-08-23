<template>
  <Corners size="big">
    <div class="transaction__header">
      <h2>Wallet</h2>
      <span>public key</span>
      <div class="network__badge">network</div>
    </div>
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
export default class WalletInfo extends Vue {}
</script>

<style lang="scss" scoped>
.transaction__header {
  position: relative;
  background: rgba(255, 255, 255, 0.05);
  padding: 16px;
  border: 1px solid rgba(255, 255, 255, 0.1) !important;
  clip-path: $big-clip-path-left-top-and-right-bottom;
  border-radius: $default-border-radius;
  width: 100%;
  display: flex;
  flex-flow: column;
}
.network__badge {
  position: absolute;
  background: greenyellow;
  right: 0;
  top: 0;
}
</style>
