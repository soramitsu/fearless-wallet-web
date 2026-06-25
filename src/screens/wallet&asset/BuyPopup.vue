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
import { defineComponent } from 'vue';

import type { BuyProvider } from '@/interfaces';
import { getProviderUrl } from '@/helpers/currencies';
import { useExtensionStore } from '@/stores/extension';

export default defineComponent({ name: 'BuyPopup' ,
  props: {
    asset: String,
    address: String,
    providers: Array,
  },
  data() {
    return {
      extensionStore: useExtensionStore(),
    };
  },
  computed: {
    headerText() {
      return this.$t('assets.buyHeader', { asset: this.asset });
    },
    providersFiltered() {
      return this.providers.filter((provider) => this.extensionStore.features?.fiat[provider]);
    },
  },
  methods: {
    openProvider(providerName: BuyProvider) {
      const url = getProviderUrl(providerName, this.asset, this.address);

          window.open(url);
    },
  },
});
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
