<template>
  <AboveForm :fullScreen="true" @closeHandler="closeForm">
    <template v-slot:header>
      <PolkaswapSettingsHeader
        :marketType="marketType"
        :showSettings="showSettings"
        :showPolkaswapIcon="showPolkaswapIcon"
        :showBackIcon="showBackIcon"
        :showCloseIcon="showCloseIcon"
        :settingHide="step === 2"
        :header="header"
        @back="back"
        @toggleSettingsVisibility="toggleSettingsVisibility"
        @closeForm="closeForm"
      />
    </template>

    <Scroll>
      <div class="swap">
        <div class="swap-content">
          <PolkaswapSettings
            v-if="showSettings"
            :marketType="marketType"
            :slippage="slippage"
            :temporaryMarketType="temporaryMarketType"
            :temporarySlippage="temporarySlippage"
            @update:temporaryMarketType="updateMarketType"
            @update:temporarySlippage="updateSlippage"
          />

          <template v-else-if="step === 1">
            <SelectInput
              text="assets.sendButtonText"
              :totalAmount="transferableSendAmount"
              :value="sendValue"
              :asset="sendAssetName"
              :assetId="sendAssetId"
              :amount="sendAmount"
              :isRotate="isSendAssetType"
              :showOriginValue="isExchangeB"
              @update:amount="updateSendAmount"
              @setMax="setMax"
              @togglePopupVisibility="() => toggleSelectAssetPopupVisibility('send')"
            />

            <SelectInput
              class="receive-input"
              text="assets.receiveButtonText"
              :totalAmount="transferableReceiveAmount"
              :value="receiveValue"
              :asset="receiveAssetName"
              :assetId="receiveAssetId"
              :amount="receiveAmount"
              :isRotate="isReceiveAssetType"
              :showOriginValue="!isExchangeB"
              @update:amount="updateReceiveAmount"
              @togglePopupVisibility="() => toggleSelectAssetPopupVisibility('receive')"
            />

            <div :class="classesSwapIcon" data-testid="swapAssets" @click="swapAssets">
              <Icon icon="swap" class="img" />
            </div>

            <template v-if="showSwapInfo">
              <div class="row" data-testid="AtoB">
                {{ sendAssetUP }} / {{ receiveAssetUP }}

                <div class="fiat-info">
                  <div data-testid="AtoBprice">{{ AToBCut }}</div>
                  <div class="price" data-testid="AtoBfiatPrice">{{ AToBValueCut }}</div>
                </div>
              </div>

              <div class="row" data-testid="BtoA">
                {{ receiveAssetUP }} / {{ sendAssetUP }}

                <div class="fiat-info">
                  <div data-testid="BtoAprice">{{ BToACut }}</div>
                  <div class="price" data-testid="BtoAfiatPrice">{{ BToAValueCut }}</div>
                </div>
              </div>
            </template>

            <SwapInfo
              :showSwapInfo="showSwapInfo"
              :marketType="marketType"
              :slippage="slippage"
              :sendAmount="sendAmount"
              :receiveAmount="receiveAmount"
              :sendValue="sendValue"
              :receiveValue="receiveValue"
              :minMaxAmount="minMaxAmountCut"
              :minMaxAmountPrice="minMaxAmountPrice"
              :fee="fee"
              :feePrice="feePrice"
              :sendAssetUP="sendAssetUP"
              :receiveAssetUP="receiveAssetUP"
              :isExchangeB="isExchangeB"
              :route="swapRoute"
            />
          </template>

          <SwapPreview
            v-if="step === 2"
            :marketType="marketType"
            :slippage="slippage"
            :sendAmount="sendAmount"
            :receiveAmount="receiveAmount"
            :sendValue="sendValue"
            :receiveValue="receiveValue"
            :minMaxAmount="minMaxAmountCut"
            :minMaxAmountPrice="minMaxAmountPrice"
            :fee="fee"
            :feePrice="feePrice"
            :sendAssetUP="sendAssetUP"
            :receiveAssetUP="receiveAssetUP"
            :isExchangeB="isExchangeB"
            :route="swapRoute"
          />
        </div>

        <div>
          <template v-if="!showSettings">
            <PolkaswapAlert />

            <PoolsBanner class="banner-pools" />
          </template>

          <div class="buttons">
            <FButton
              v-if="showSettings"
              size="big"
              text="assets.resetToDefault"
              type="secondary"
              width="49%"
              :border="false"
              data-testId="resetToDefault"
              @click="resetSettings"
            />

            <FButton
              size="big"
              :text="buttonText"
              :disabled="buttonPreviewDisabled"
              :width="widthButton"
              data-testid="proceed"
              @click="proceed"
            />
          </div>
        </div>
      </div>
    </Scroll>

    <SelectPopup
      v-if="showSelectPopup"
      placeholder="common.searchAmongAssets"
      verticalPlacement="top"
      :value="selectPopupValue"
      :showBlur="false"
      :showBackground="false"
      :top="top"
      :left="160"
      :height="285"
      :options="optionsCurrency"
      @handlerFilter="handlerFilter"
      @toggleValue="toggleSelectedAsset"
      @handlerClose="toggleSelectAssetPopupVisibility('')"
    />

    <ConfirmationPasswordPopup
      v-if="showConfirmationPasswordPopup"
      :currency="sendCurrency"
      :amount="sendAmount"
      :value="sendValue"
      :firstIcon="sendAssetId"
      :secondIcon="receiveAssetId"
      :tx="tx"
      extrinsicType="swap"
      @close="confirmationPasswordPopupClose"
    />
  </AboveForm>
</template>

<script lang="ts" setup>
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { FPNumber } from '@/lib/fpNumber';
import SwapPreview from '@/screens/polkaswap/swap/SwapPreview.vue';
import PolkaswapAlert from '@/screens/polkaswap/PolkaswapAlert.vue';
import SwapInfo from '@/screens/polkaswap/swap/SwapInfo.vue';
import PolkaswapSettings from '@/screens/polkaswap/PolkaswapSettings.vue';
import PolkaswapSettingsHeader from '@/screens/polkaswap/PolkaswapSettingsHeader.vue';
import ConfirmationPasswordPopup from '@/screens/wallet&asset/ConfirmationPasswordPopup.vue';
import PoolsBanner from '@/screens/pools/PoolsBanner.vue';
import { checkSwap } from '@/extension/messaging';
import {
  getCurrencyOptions,
  getXORCurrency,
  calcTransferableSendMinusFee as calcSendMinusFee,
  isValidAmountAsset,
} from '@/helpers/currencies';
import { getCostOfAssets } from '@/helpers/transfers';
import { MarketType, type SwapOptions } from '@/interfaces';
import { addNumbers } from '@/helpers/numbers';
import { SORA_NETWORK_NAME, SORA_UTILITY_ASSET, SORA_XOR_ASSET_ID } from '@/consts/sora';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';
import { balanceMatchesNetwork, findTokenBalanceByNetwork } from '@/helpers';

const SWAP_INTERVAL_RECALCULATE = 10000;

const soraNetworkName = SORA_NETWORK_NAME;
const networksStore = useNetworksStore();
const accountsStore = useAccountsStore();
const router = useRouter();
const routeInstance = useRoute();
const { t, n } = useI18n();

const step = ref(1);
const slippage = ref(0.5);
const temporarySlippage = ref(0.5);
const marketType = ref<MarketType>(MarketType.SMART);
const temporaryMarketType = ref<MarketType>(MarketType.SMART);
const sendAssetId = ref('');
const receiveAssetId = ref('');
const sendAmount = ref('');
const receiveAmount = ref('');
const minMaxAmount = ref('');
const selectAssetType = ref<'send' | 'receive' | ''>('');
const swapRoute = ref('');
const AToB = ref('');
const BToA = ref('');
const filterValue = ref('');
const showSettings = ref(false);
const showConfirmationPasswordPopup = ref(false);
const isExchangeB = ref(false);
const tx = ref<SwapOptions>({} as SwapOptions);

let swapInterval: ReturnType<typeof setInterval> | null = null;

const fee = computed(() => networksStore.soraFees?.Swap ?? '');
const currencyXOR = computed(() => getXORCurrency(accountsStore.balances));

const sendCurrency = computed(() => accountsStore.balances.find(({ groupId }) => groupId === sendAssetId.value));

const receiveCurrency = computed(() => accountsStore.balances.find(({ groupId }) => groupId === receiveAssetId.value));

const sendAssetName = computed(() => sendCurrency.value?.symbol ?? '');
const receiveAssetName = computed(() => receiveCurrency.value?.symbol ?? '');

const sendAssetPrice = computed(() => {
  const priceId = sendCurrency.value?.priceId ?? '';

  return networksStore.getAssetPrice(priceId).price;
});

const receiveAssetPrice = computed(() => {
  const priceId = receiveCurrency.value?.priceId ?? '';

  return networksStore.getAssetPrice(priceId).price;
});

const showBackIcon = computed(() => !showSettings.value);
const showPolkaswapIcon = computed(() => step.value === 1 && !showSettings.value);
const showCloseIcon = computed(() => (showSettings.value ? true : step.value !== 1));

const classesSwapIcon = computed(() => ['swap-icon', { 'swap-icon-disable': receiveAssetId.value === '' }]);

const feePrice = computed(() => {
  const feeValue = Number(fee.value ?? 0);
  const price = networksStore.getAssetPrice(currencyXOR.value?.priceId ?? '').price;
  const balance = price * feeValue;

  return n(balance || 0, 'price');
});

const soraMainAssetUpper = computed(() => SORA_UTILITY_ASSET.toUpperCase());

const minMaxAmountPrice = computed(() => {
  const assetPrice = isExchangeB.value
    ? networksStore.getAssetPrice(sendAssetId.value).price
    : networksStore.getAssetPrice(receiveAssetId.value).price;

  const price = (getCostOfAssets(+minMaxAmount.value, assetPrice) as number) ?? 0;

  return `${accountsStore.fiatSymbol} ${n(price, 'price')}`;
});

const minMaxAssetName = computed(() => (isExchangeB.value ? sendAssetUP.value : receiveAssetUP.value));

const minMaxAmountCut = computed(() => `${n(+minMaxAmount.value || 0, 'decimal')} ${minMaxAssetName.value}`);

const AToBCut = computed(() => {
  const value = n(+AToB.value || 0, 'decimal');

  return `${value} ${receiveAssetUP.value}`;
});

const BToACut = computed(() => {
  const value = n(+BToA.value || 0, 'decimal');

  return `${value} ${sendAssetUP.value}`;
});

const AToBValueCut = computed(() => {
  const xorPrice = networksStore.getAssetPrice(sendAssetId.value).price;
  const price = xorPrice * +AToB.value;

  return `${accountsStore.fiatSymbol} ${n(price || 0, 'price')}`;
});

const BToAValueCut = computed(() => {
  const xorPrice = networksStore.getAssetPrice(receiveAssetId.value).price;
  const price = xorPrice * +BToA.value;

  return `${accountsStore.fiatSymbol} ${n(price || 0, 'price')}`;
});

const widthButton = computed(() => (showSettings.value ? '49%' : '100%'));

const header = computed(() => {
  if (showSettings.value) return t('assets.poolSettings');

  if (step.value === 1 || step.value === 4) return t('pools.poolDetails');

  if (step.value === 2) {
    if (showSettings.value) return t('assets.poolSettings');

    return t('polkaswap.preview');
  }

  return t('common.swap');
});

const showSwapInfo = computed(() => sendAmount.value !== '' && receiveAmount.value !== '');
const showSelectPopup = computed(() => selectAssetType.value !== '');

const optionsCurrency = computed(() => {
  const filter = filterValue.value.toLowerCase();

  const tokensFiltered = accountsStore.balances.filter(({ balances }) =>
    balances.some((balance) => balanceMatchesNetwork(balance, soraNetworkName))
  );

  return getCurrencyOptions(tokensFiltered).filter(({ name, value }) => {
    if (!name.toLowerCase().includes(filter)) return false;

    const id = isSendAssetType.value ? receiveAssetId.value : sendAssetId.value;

    return value !== id;
  });
});

const top = computed(() => (isSendAssetType.value ? 145 : 248));
const selectPopupValue = computed(() => (isSendAssetType.value ? sendAssetId.value : receiveAssetId.value));

const isSendAssetType = computed(() => selectAssetType.value === 'send');
const isReceiveAssetType = computed(() => selectAssetType.value === 'receive');

const sendAssetUP = computed(() => sendAssetName.value.toUpperCase());
const receiveAssetUP = computed(() => receiveAssetName.value.toUpperCase());

const sendCurrencyBalance = computed(() => findTokenBalanceByNetwork(sendCurrency.value, soraNetworkName));

const transferableSendAmount = computed(() => +(sendCurrencyBalance.value?.transferable ?? 0));

const transferableReceiveAmount = computed(() => {
  const balance = findTokenBalanceByNetwork(receiveCurrency.value, soraNetworkName);

  return +(balance?.transferable ?? 0);
});

const sendValue = computed(() => getCostOfAssets(+sendAmount.value || 0, sendAssetPrice.value, 'string'));
const receiveValue = computed(() => getCostOfAssets(+receiveAmount.value || 0, receiveAssetPrice.value, 'string'));

const buttonText = computed(() => {
  if (showSettings.value) return 'common.save';

  if (sendAmount.value !== '' && receiveAmount.value !== '' && fee.value === '') return 'assets.calculateFee';

  if (!isValidSendAsset.value) return { text: 'assets.insufficientBalance', localeProps: { asset: sendAssetUP.value } };

  if (!isValidTransferByXOR.value)
    return { text: 'assets.insufficientBalance', localeProps: { asset: soraMainAssetUpper.value } };

  if (+sendAmount.value === 0 || +receiveAmount.value === 0) return { text: 'assets.insufficientLiquidity' };

  return step.value === 1 ? 'assets.preview' : 'common.confirm';
});

const buttonPreviewDisabled = computed(() => {
  if (step.value === 2 || showSettings.value) return false;

  if (
    fee.value === '' ||
    !isValidSendAsset.value ||
    !isValidTransferByXOR.value ||
    +sendAmount.value === 0 ||
    +receiveAmount.value === 0
  )
    return true;

  return sendAssetId.value === '' || receiveAssetId.value === '' || sendAmount.value === '';
});

const isValidSendAsset = computed(() =>
  isValidAmountAsset(sendCurrency.value, soraNetworkName, fee.value, sendAmount.value)
);

const isValidTransferByXOR = computed(() => {
  if (fee.value === '') return false;

  if (receiveAssetName.value === SORA_UTILITY_ASSET) {
    const transferableXor = calcTransferableXor();
    const receiveAmountValue = isExchangeB.value ? receiveAmount.value : minMaxAmount.value;
    const transferableXORAfterSending = addNumbers([transferableXor, receiveAmountValue]);

    return FPNumber.gt(new FPNumber(transferableXORAfterSending), new FPNumber(fee.value));
  }

  if (sendAssetName.value === SORA_UTILITY_ASSET) return true;

  return FPNumber.gte(new FPNumber(calcTransferableXor()), new FPNumber(fee.value));
});

function updateComponentParams() {
  const params = routeInstance.params as Record<string, string | string[]>;
  const resetParam = Array.isArray(params.reset) ? params.reset[0] : params.reset;
  const restPriceXORParam = Array.isArray(params.restPriceXOR) ? params.restPriceXOR[0] : params.restPriceXOR;
  const assetIdParam = Array.isArray(params.assetId) ? params.assetId[0] : params.assetId;

  if (resetParam !== undefined) {
    receiveAssetId.value = '';
    sendAmount.value = '';
    receiveAmount.value = '';
  } else if (restPriceXORParam) {
    receiveAssetId.value = SORA_XOR_ASSET_ID;
    receiveAmount.value = restPriceXORParam;
    isExchangeB.value = true;
  }

  sendAssetId.value = assetIdParam ?? SORA_XOR_ASSET_ID;
}

async function updateSwapQuotes() {
  if (sendAssetId.value === '' || receiveAssetId.value === '') {
    if (isExchangeB.value) sendAmount.value = '';
    else receiveAmount.value = '';

    return;
  }

  if ((isExchangeB.value && receiveAmount.value === '') || (!isExchangeB.value && sendAmount.value === '')) {
    sendAmount.value = '';
    receiveAmount.value = '';

    return;
  }

  const createSwap = async () => {
    const {
      amountA,
      amountB,
      AToB: newAToB,
      BToA: newBToA,
      swapOptions,
      minMaxValue,
      route,
    } = await checkSwap({
      network: soraNetworkName,
      amountA: sendAmount.value,
      amountB: receiveAmount.value,
      assetAId: sendAssetId.value,
      assetBId: receiveAssetId.value,
      slippage: slippage.value,
      symbolA: sendAssetName.value,
      symbolB: receiveAssetName.value,
      isExchangeB: isExchangeB.value,
      marketType: marketType.value,
    });

    if (isExchangeB.value) sendAmount.value = amountA;
    else receiveAmount.value = amountB;

    tx.value = swapOptions ?? ({} as SwapOptions);
    minMaxAmount.value = minMaxValue;
    AToB.value = newAToB;
    BToA.value = newBToA;
    swapRoute.value = route;
  };

  clearSwapInterval();
  swapInterval = setInterval(createSwap, SWAP_INTERVAL_RECALCULATE);

  await createSwap();
}

function clearSwapInterval() {
  if (swapInterval) {
    clearInterval(swapInterval);
    swapInterval = null;
  }
}

function closeForm() {
  if (showSettings.value) {
    toggleSettingsVisibility();

    return;
  }

  clearSwapInterval();
  router.back();
}

function updateSendAmount(value: string) {
  isExchangeB.value = false;
  sendAmount.value = value;

  void updateSwapQuotes();
}

function updateReceiveAmount(value: string) {
  isExchangeB.value = true;
  receiveAmount.value = value;

  void updateSwapQuotes();
}

function toggleSelectedAsset(value: string) {
  if (isSendAssetType.value) sendAssetId.value = value;
  else receiveAssetId.value = value;

  void updateSwapQuotes();
  toggleSelectAssetPopupVisibility('');
}

function confirmationPasswordPopupClose(closeForm: boolean) {
  showConfirmationPasswordPopup.value = false;

  if (closeForm) {
    sendAmount.value = '';
    receiveAmount.value = '';
    step.value = 1;

    clearSwapInterval();
  }
}

function handlerFilter(value: string) {
  filterValue.value = value;
}

function toggleSelectAssetPopupVisibility(value: 'send' | 'receive' | '') {
  selectAssetType.value = selectAssetType.value !== '' ? '' : value;
  filterValue.value = '';
}

async function proceed() {
  if (showSettings.value) {
    marketType.value = temporaryMarketType.value;
    slippage.value = temporarySlippage.value;
    showSettings.value = false;

    await updateSwapQuotes();
  } else if (step.value === 1) step.value += 1;
  else showConfirmationPasswordPopup.value = true;
}

function resetSettings() {
  temporaryMarketType.value = MarketType.SMART;
  temporarySlippage.value = 0.5;

  void proceed();
}

function toggleSettingsVisibility() {
  showSettings.value = !showSettings.value;
  temporaryMarketType.value = marketType.value;
  temporarySlippage.value = slippage.value;
}

function swapAssets() {
  if (receiveAssetId.value === '') return;

  const previousSendAssetId = sendAssetId.value;

  if (isExchangeB.value) sendAmount.value = receiveAmount.value;
  else receiveAmount.value = sendAmount.value;

  isExchangeB.value = !isExchangeB.value;
  sendAssetId.value = receiveAssetId.value;
  receiveAssetId.value = previousSendAssetId;

  void updateSwapQuotes();
}

function back() {
  if (step.value === 1) closeForm();
  else step.value -= 1;
}

function updateMarketType(value: MarketType) {
  temporaryMarketType.value = value;
}

function updateSlippage(value: number) {
  temporarySlippage.value = value;
}

function calcTransferableXor() {
  const balance = findTokenBalanceByNetwork(currencyXOR.value, soraNetworkName);

  return balance?.transferable?.toString() ?? '0';
}

function calculateTransferableSendMinusFee() {
  return calcSendMinusFee(sendCurrency.value, soraNetworkName, fee.value);
}

function setMax() {
  isExchangeB.value = false;
  sendAmount.value = calculateTransferableSendMinusFee();

  void updateSwapQuotes();
}

onMounted(() => {
  updateComponentParams();
});

onActivated(() => {
  updateComponentParams();
});

onDeactivated(() => {
  selectAssetType.value = '';
  step.value = 1;
});

onBeforeUnmount(() => {
  clearSwapInterval();
});
</script>

<style lang="scss" scoped>
.row {
  margin: 0 16px;
  height: 55px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: $secondary-border;

  .fiat-info {
    text-align: right;
    display: flex;
    flex-direction: column;
    max-width: 300px;
    overflow: hidden;
    text-overflow: ellipsis;

    .price {
      color: $gray-color;
    }
  }
}

.buttons {
  display: flex;
  justify-content: space-between;
  margin-top: 10px;
}

.img {
  height: 20px;
  width: 20px;
}

.swap-icon-disable {
  cursor: not-allowed !important;
  background-color: rgb(29, 29, 29) !important;
}

.swap {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.banner-pools {
  margin-top: 10px;
}

.swap-content {
  color: $default-white;

  .receive-input {
    margin: 7px 0 14px;
  }

  .swap-icon {
    border-radius: 50%;
    background-color: rgb(29, 29, 29);
    width: 46px;
    height: 46px;
    display: flex;
    justify-content: center;
    align-items: center;
    margin: -46px auto 0;
    border: $secondary-border;
    opacity: 1;
    position: relative;
    top: -92px;
    cursor: pointer;

    &:hover {
      background-color: rgb(34, 32, 32);
    }
  }
}
</style>
