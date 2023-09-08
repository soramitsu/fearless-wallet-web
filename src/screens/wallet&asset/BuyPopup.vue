<template>
  <Popup :headerText="headerText" :showBorder="true" @handlerClose="closePopup" sizeWidth="big">
    <div class="buy-content">
      <FButton
        v-for="provider in providersFiltered"
        class="provider-button"
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
import { Getter } from 'vuex-class';
import type { Features } from '@/store/extension/types';
import type { BuyProvider } from '@/interfaces';
import { getProviderUrl } from '@/helpers/currencies';
import { GettersTypes as ExtensionGettersTypes } from '@/store/extension/getters';

@Component
export default class BuyPopup extends Vue {
  @Prop(String) asset!: string;
  @Prop(String) address!: string;
  @Prop(Array) providers!: ('ramp' | 'moonpay')[];
  @Prop(Function) closePopup!: VoidFunction;
  @Getter(ExtensionGettersTypes.features) features!: Nullable<Features>;

  get headerText() {
    return this.$t('assets.buyHeader', { asset: this.asset });
  }

  get providersFiltered() {
    return this.providers.filter((provider) => this.features?.fiat[provider]);
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
