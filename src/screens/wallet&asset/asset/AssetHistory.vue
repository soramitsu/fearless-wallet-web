<template>
  <Fragment>
    <AssetActionButtons
      :showBuyButton="showBuyButton"
      :currency="currency"
      :assetId="selectedAssetId"
      v-on="attrs"
      @togglePopupButton="togglePopupButton"
    />

    <History :currency="currency" v-on="attrs" />

    <Blur v-if="showPopupButton" @click="togglePopupButton">
      <div class="popup-button">
        <BorderButton
          class="activity-button activity-button--settings popup__button-width"
          iconName="three-dots-vertical"
          @click="togglePopupButton"
        />

        <BorderButton
          v-if="showBuyButton"
          class="activity-button"
          text="assets.buy"
          iconName="plus-pink"
          @click="handleToggleVisible"
        />
      </div>
    </Blur>
  </Fragment>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, useAttrs } from 'vue';
import { useRoute } from 'vue-router';
import History from './History.vue';
import type { TokenGroup } from '@extension-base/background/types/types';
import AssetActionButtons from '@/screens/wallet&asset/asset/AssetActionButtons.vue';
import BaseApi from '@/util/BaseApi';
import { fetchEvmBalance } from '@/extension/messaging';
import { useExtensionStore } from '@/stores/extension';

defineOptions({ inheritAttrs: false });

const props = defineProps<{
  currency: TokenGroup;
}>();

const emit = defineEmits<{
  toggleVisible: [];
}>();

const attrs = useAttrs();
const extensionStore = useExtensionStore();
const route = useRoute();

const showPopupButton = ref(false);

const selectedAssetId = computed(() => route.params.assetId as string);

const currency = computed(() => props.currency);

const providers = computed(() => props.currency.providers ?? []);

const mainNetwork = computed(() => {
  const currency = props.currency.balances?.find((network) => network.isUtility || network.isNative);

  return currency ? currency.name : '';
});

const selectedNetwork = computed(() => (route.params.selectedNetwork as string | undefined) ?? '');

const showBuyButton = computed(() => {
  const availableProviders = providers.value.filter((provider) => extensionStore.features?.fiat[provider]);

  if (availableProviders.length === 0) return false;

  return mainNetwork.value?.toLowerCase() === selectedNetwork.value.toLowerCase();
});

function togglePopupButton() {
  showPopupButton.value = !showPopupButton.value;
}

function handleToggleVisible() {
  emit('toggleVisible');
}

onMounted(() => {
  if (BaseApi.isEthereumNativeNetwork(selectedNetwork.value)) fetchEvmBalance(selectedAssetId.value);
});
</script>

<style lang="scss" scoped>
.popup-button {
  position: absolute;
  display: flex;
  flex-flow: column;
  align-items: flex-end;
  top: 250px;
  left: 465px;
  height: 100px;
  gap: 10px;

  .popup__button-width {
    width: 42px;
  }
}
</style>
