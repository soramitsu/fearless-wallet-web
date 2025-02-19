<template>
  <Popup :headerText="headerText" :showBorder="true" @handlerClose="$emit('closePopup')" sizeWidth="big">
    <div class="buy-content">
      <FButton
        v-for="provider in providersFiltered"
        class="provider-button"
        data-testid="buyContentBtn"
        :key="provider"
        :text="provider"
        :iconName="provider"
        @click="openProvider(provider)"
      />
    </div>
  </Popup>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import type { BuyProvider } from '@/interfaces';
import { getProviderUrl } from '@/helpers/currencies';
import { useExtensionStore } from '@/stores/extension';

@Component
export default class BuyPopup extends Vue {
  extensionStore = useExtensionStore();

  @Prop(String) asset!: string;
  @Prop(String) address!: string;
  @Prop(Array) providers!: ('ramp' | 'moonpay')[];

  get headerText() {
    return this.$t('assets.buyHeader', { asset: this.asset });
  }

  get providersFiltered() {
    return this.providers.filter((provider) => this.extensionStore.features?.fiat[provider]);
  }

  openProvider(providerName: BuyProvider) {
    const url = getProviderUrl(providerName, this.asset, this.address);

    window.open(url);
  }
}
</script>

<style lang="scss" scoped>
.buy-content {
  padding: 0 $default-padding;
  margin: 10px 0 3px;

  .provider-button {
    margin-bottom: 10px;

    &:last-child {
      margin-bottom: 0;
    }
  }
}
</style>
