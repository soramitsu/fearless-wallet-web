<template>
  <Popup :headerText="headerText" :showBorder="true" @handlerClose="handlerClose" sizeWidth="big">
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

<script lang="ts" setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { BuyProvider } from '@/interfaces';
import { getProviderUrl } from '@/helpers/currencies';
import { useExtensionStore } from '@/stores/extension';

const props = defineProps<{
  asset: string;
  address: string;
  providers: BuyProvider[];
}>();

const emit = defineEmits<{
  closePopup: [];
}>();

const extensionStore = useExtensionStore();
const { t } = useI18n();

const headerText = computed(() => t('assets.buyHeader', { asset: props.asset }));

const providersFiltered = computed(() => props.providers.filter((provider) => extensionStore.features?.fiat[provider]));

function handlerClose() {
  emit('closePopup');
}

function openProvider(providerName: BuyProvider) {
  const url = getProviderUrl(providerName, props.asset, props.address);

  window.open(url);
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
