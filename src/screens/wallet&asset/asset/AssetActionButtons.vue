<template>
  <div class="activity">
    <BorderButton
      class="activity-button"
      text="assets.sendButtonText"
      iconName="send"
      data-testid="sendBtn"
      @click="onRoute('send')"
    />

    <BorderButton
      class="activity-button"
      width="100%"
      text="assets.receiveButtonText"
      iconName="receive"
      data-testid="receiveBtn"
      @click="onRoute('receive')"
    />

    <BorderButton
      v-if="showCrossChainButton"
      class="activity-button"
      text="assets.crossChain"
      iconName="cross-chain"
      data-testid="crossChainBtn"
      @click="onRoute('crossChain')"
    />

    <BorderButton
      v-if="showSwapButton"
      class="activity-button"
      text="assets.swap"
      iconName="swap"
      data-testid="swapBtn"
      @click="openSoraSwap"
    />

    <BorderButton
      v-if="showBuyButton && !isNeedPopupButton"
      class="activity-button"
      text="assets.buy"
      iconName="plus-pink"
      data-testid="buyBtn"
      @click="handleToggleVisible"
    />

    <BorderButton
      v-if="isNeedPopupButton"
      class="activity-button activity-button--settings"
      iconName="three-dots-vertical"
      data-testid="threeDotsVerticalBtn"
      @click="handleTogglePopupButton"
    />
  </div>
</template>
<script lang="ts" setup>
import { computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { getNativeAssetName } from '@extension-base/background/handlers/utils';
import type { TokenGroup } from '@extension-base/background/types/types';
import { isSora } from '@/helpers';
import { Components } from '@/router/routes';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

const props = defineProps<{
  currency: TokenGroup;
  showBuyButton: boolean;
  assetId: string;
}>();

const emit = defineEmits<{
  toggleVisible: [];
  togglePopupButton: [];
}>();

const networksStore = useNetworksStore();
const accountsStore = useAccountsStore();
const router = useRouter();
const route = useRoute();

const selectedNetwork = computed(() => (route.params.selectedNetwork as string | undefined) ?? '');
const selectedAsset = computed(() => props.currency?.symbol?.toLowerCase() ?? '');

const showSwapButton = computed(() => isSora(selectedNetwork.value) && !accountsStore.selectedWallet.isMobile);

const showCrossChainButton = computed(() => {
  if (selectedNetwork.value === '') return false;

  const network = networksStore.getNetwork(selectedNetwork.value);
  const asset = getNativeAssetName(selectedAsset.value);

  if (!network || network.xcm === undefined) return false;

  return network.xcm.availableAssets?.some(({ symbol }) => symbol.toLowerCase() === asset);
});

const isNeedPopupButton = computed(() => showCrossChainButton.value && props.showBuyButton && showSwapButton.value);

function onRoute(form: 'send' | 'receive' | 'crossChain') {
  const name =
    form === 'send' ? Components.SendForm : form === 'receive' ? Components.ReceiveForm : Components.CrossChainForm;

  router.push({
    name,
    params: {
      assetId: route.params.assetId,
      network: selectedNetwork.value,
    },
  });
}

function openSoraSwap() {
  router.push({
    name: Components.SoraSwap,
    params: {
      assetId: props.assetId,
      reset: '',
    },
  });
}

function handleToggleVisible() {
  emit('toggleVisible');
}

function handleTogglePopupButton() {
  emit('togglePopupButton');
}
</script>

<style lang="scss" scoped>
.activity {
  display: flex;
  justify-content: space-between;
  gap: 5px;

  .activity-button {
    flex-grow: 1;

    &:first-child {
      margin-left: 0;
    }

    &--settings {
      color: $pink-color;
      flex-grow: 0;
      margin: 0;
    }
  }
}
</style>
