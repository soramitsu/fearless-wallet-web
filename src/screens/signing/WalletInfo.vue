<template>
  <Corners size="big">
    <div class="transaction__header">
      <img class="wallet__logo" src="@/assets/wallet-logo-transaction.svg" />
      <div class="wallet-info__content">
        <span class="wallet__name">{{ name }}</span>
        <div class="wallet-info__address-container">
          <span ref="address" class="wallet__address" @click="saveToClipboard">{{ address }}</span>
          <img class="wallet-info__clipboard" src="@/assets/clipboard.svg" @click="saveToClipboard" />
        </div>
      </div>
    </div>
  </Corners>
</template>

<script lang="ts">
import { Vue, Component, Prop } from 'vue-property-decorator';
import Corners from '@/components/Corners.vue';
@Component({
  components: {
    Corners,
  },
})
export default class WalletInfo extends Vue {
  @Prop(String) address!: string;
  @Prop(String) name!: string;

  $refs!: {
    address: HTMLSpanElement;
  };

  saveToClipboard() {
    navigator.clipboard.writeText(this.$refs.address.innerText);
  }
}
</script>

<style lang="scss" scoped>
.transaction__header {
  position: relative;
  background: rgba(255, 255, 255, 0.05);
  padding: 9px;
  border: 1px solid rgba(255, 255, 255, 0.1) !important;
  clip-path: $big-clip-path-left-top-and-right-bottom;
  border-radius: $default-border-radius;
  width: 100%;
  display: flex;
  flex-flow: row;
  align-items: center;
  gap: 12px;
}

.network__badge-wrapper {
  position: absolute;
  right: 0;
  top: 0;
  clip-path: polygon(64% 0, 100% 0, 100% 22%, 80% 100%, 0 100%, 0 81%, 24% 0);
}

.network__badge {
  background: #7700ee;
  padding: 3px 28px 3px 28px;
  line-height: 18px;
  color: white;
}

.wallet-info__content {
  display: flex;
  flex-flow: column nowrap;
  align-items: flex-start;
}

.wallet-info__address-container {
  display: flex;
  flex-flow: row nowrap;
  align-items: center;
  justify-content: center;
}

.wallet-info__clipboard {
  width: 24px;
  cursor: pointer;
}

.wallet-info__clipboard:hover {
  fill: #7700ee;
}

.wallet__name {
  font-size: 18px;
  font-weight: 700;
  line-height: 30px;
}

.wallet__address {
  font-size: 14px;
  max-width: 400px;
  overflow: hidden;
  cursor: pointer;
  text-overflow: ellipsis;
  margin-right: 14px;
}

.wallet__logo {
  width: 32px;
  height: 100%;
}
</style>
