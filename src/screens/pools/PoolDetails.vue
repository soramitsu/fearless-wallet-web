<template>
  <AboveForm :fullScreen="true" @closeHandler="closeForm">
    <template v-slot:header>
      <PolkaswapSettingsHeader
        :showSettings="showSettings"
        :showPolkaswapIcon="showPolkaswapIcon"
        :showBackIcon="showBackIcon"
        :showCloseIcon="showCloseIcon"
        :showBackMock="step === 1"
        :settingHide="step !== 2"
        :header="header"
        @back="handlerBack"
        @toggleSettingsVisibility="toggleSettingsVisibility"
        @closeForm="closeForm"
      />
    </template>

    <Scroll>
      <div class="pool-details">
        <div>
          <PoolHeader v-if="step === 1 || step === 3 || step === 4" :poolParams="poolParams" :step="step" />

          <PolkaswapSettings
            v-if="showSettings"
            :slippage="slippage"
            :temporarySlippage="temporarySlippage"
            @update:temporarySlippage="updateSlippage"
          />

          <InputsForm
            v-else-if="step === 2"
            :poolParams="poolParams"
            :amount1="amount1"
            :amount2="amount2"
            :currency1="currency1"
            :currency2="currency2"
            :fee="fee"
            :extrinsicType="extrinsicType"
            :isExchangeB="isExchangeB"
            @update:amount1="updateAmount1"
            @update:amount2="updateAmount2"
            @update:isExchangeB="updateIsExchangeB"
          />

          <Alert v-if="showLiquidityWarning" message="pools.emptyLiquidityWarning" />

          <PoolDescription
            v-if="!showSettings && (step === 1 || step === 2 || step === 4)"
            :extrinsicType="step === 2 ? extrinsicType : ''"
            :poolParams="poolParams"
            :amount1="amount1"
            :amount2="amount2"
            :slippage="slippage"
            :showAdditionalInfo="step === 2 || step === 4"
            :fee="fee"
            :isExchangeB="isExchangeB"
          />

          <div v-if="step === 3">
            <DirectionContentForm
              :asset1="asset1"
              :asset2="asset2"
              :amount1="amount1"
              :amount2="amount2"
              :priceId1="poolParams?.asset1.priceId"
              :priceId2="poolParams?.asset2.priceId"
              icon="plus-pink"
            />

            <ContentForm :height="225" :isStaticHeight="true" :bottomRightCorner="true">
              <PoolDescription
                :poolParams="poolParams"
                :amount1="amount1"
                :amount2="amount2"
                :showAdditionalInfo="true"
                :slippage="slippage"
                :fee="fee"
                :extrinsicType="extrinsicType"
              />
            </ContentForm>

            <Alert message="assets.slippageWarning" class="warning" />

            <Alert v-if="extrinsicType === 'removeLiquidity'" message="pools.removeWarning" class="warning" />
          </div>

          <div v-else-if="step === 4">
            <InfoRow :text="asset1PooledStr" :value="asset1MyAmount" />

            <InfoRow :text="asset2PooledStr" :value="asset2MyAmount" />
          </div>
        </div>

        <div>
          <PolkaswapAlert v-if="!showSettings" class="warning" />

          <div class="activity-buttons">
            <FButton
              v-if="showSecondBtn"
              width="260px"
              size="big"
              fontSize="big"
              class="remove-button"
              data-testid="activityBtn"
              :text="btnSecondText"
              type="secondary"
              :border="false"
              @click="secondBtnHandler"
            />

            <FButton
              :width="widthConfirmBtn"
              size="big"
              fontSize="big"
              data-testid="supplyBtn"
              :text="btnText"
              :disabled="confirmBtnDisabled"
              @click="supply"
            />
          </div>
        </div>
      </div>
    </Scroll>

    <ConfirmationPasswordPopup
      v-if="showConfirmationPasswordPopup"
      :currency="currency1"
      :amount="amount1"
      :value="amount1Value"
      :fee="fee"
      :feeValue="feeValue"
      :firstIcon="icon1"
      :secondIcon="icon2"
      :tx="tx"
      :extrinsicType="extrinsicType"
      @close="confirmationPasswordPopupClose"
    />
  </AboveForm>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import PoolDescription from '@/screens/pools/PoolDescription.vue';
import PoolHeader from '@/screens/pools/PoolHeader.vue';
import InputsForm from '@/screens/pools/InputsForm.vue';
import { type RequestPool } from '@/extension/background/extension-base/src/services/pools-service/types';
import { getCostOfAssets } from '@/helpers/transfers';
import { getUtilityAsset, getXORCurrency, isValidAmountAsset } from '@/helpers/currencies';
import { type PoolsOperation } from '@/interfaces/pools';
import PolkaswapSettingsHeader from '@/screens/polkaswap/PolkaswapSettingsHeader.vue';
import PolkaswapSettings from '@/screens/polkaswap/PolkaswapSettings.vue';
import PolkaswapAlert from '@/screens/polkaswap/PolkaswapAlert.vue';
import { isSameString } from '@/helpers';
import ConfirmationPasswordPopup from '@/screens/wallet&asset/ConfirmationPasswordPopup.vue';
import { usePoolsStore } from '@/stores/pools';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

const router = useRouter();
const route = useRoute();
const { t, n } = useI18n();

const accountsStore = useAccountsStore();
const networksStore = useNetworksStore();
const poolsStore = usePoolsStore();

const step = ref(1); // 1 = pool preview, 2 = add/remove liquidity, 3 = confirmation, 4 = my pool
const amount1 = ref('');
const amount2 = ref('');
const extrinsicType = ref<PoolsOperation | ''>('');
const slippage = ref(0.5);
const temporarySlippage = ref(0.5);
const showSettings = ref(false);
const showConfirmationPasswordPopup = ref(false);
const isExchangeB = ref(false);

const fee = computed(() => {
  const soraFees = networksStore.soraFees;

  if (!soraFees) return '';

  return extrinsicType.value === 'addLiquidity' ? soraFees.AddLiquidity : soraFees.RemoveLiquidity;
});

const poolName = computed(() => (typeof route.params.poolName === 'string' ? route.params.poolName : ''));
const splitPoolName = computed(() => {
  const [first = '', second = ''] = poolName.value.split('-');

  return [first, second];
});

const asset1 = computed(() => splitPoolName.value[0] ?? '');
const asset2 = computed(() => splitPoolName.value[1] ?? '');

const poolParams = computed(() => {
  const allPools = [...poolsStore.poolsItems, ...poolsStore.myPoolsItems];

  return (
    allPools.find(
      ({ asset1: assetA, asset2: assetB }) =>
        isSameString(assetA.name, asset1.value) && isSameString(assetB.name, asset2.value)
    ) ?? null
  );
});

const showLiquidityWarning = computed(
  () => step.value === 2 && poolParams.value?.asset1.reserve === '0' && poolParams.value?.asset2.reserve === '0'
);

const showPolkaswapIcon = computed(() => step.value === 2 && !showSettings.value);

const network = computed(() => poolParams.value?.network ?? '');

const asset1MyAmount = computed(() => n(+(poolParams.value?.asset1.tokenBalance ?? 0), 'decimal'));
const asset2MyAmount = computed(() => n(+(poolParams.value?.asset2.tokenBalance ?? 0), 'decimal'));

const asset1PooledStr = computed(() => t('pools.yourPooled', { asset: asset1.value.toUpperCase() }));
const asset2PooledStr = computed(() => t('pools.yourPooled', { asset: asset2.value.toUpperCase() }));

const utilityCurrency = computed(() => getUtilityAsset(accountsStore.balances, network.value));
const utilityAssetPrice = computed(() => networksStore.getAssetPrice(utilityCurrency.value?.priceId ?? '').price);

const feeValue = computed(() => getCostOfAssets(fee.value, utilityAssetPrice.value).toString());

const currency1 = computed(() =>
  accountsStore.balances.find(({ groupId }) => isSameString(groupId, poolParams.value?.asset1.id))
);
const currency2 = computed(() =>
  accountsStore.balances.find(({ groupId }) => isSameString(groupId, poolParams.value?.asset2.id))
);

const amount1AssetPrice = computed(() => networksStore.getAssetPrice(poolParams.value?.asset1.priceId ?? '').price);
const amount1Value = computed(() => getCostOfAssets(amount1.value, amount1AssetPrice.value).toString());

const currencyXOR = computed(() => getXORCurrency(accountsStore.balances));

const isValidAsset1 = computed(() => {
  const currency = currency1.value;
  const params = poolParams.value;
  const networkName = network.value;

  if (!currency || !params) return false;

  const poolCurrency =
    extrinsicType.value === 'removeLiquidity'
      ? {
          ...currency,
          balances: currency.balances.map((item) => ({
            ...item,
            transferable: params.asset1.tokenBalance,
          })),
        }
      : currency;

  const isValid = isValidAmountAsset(poolCurrency, networkName, '0', amount1.value);

  if (!isValid) return false;

  return isValidAmountAsset(currencyXOR.value, networkName, fee.value, '0');
});

const isValidAsset2 = computed(() => {
  const currency = currency2.value;
  const params = poolParams.value;
  const networkName = network.value;

  if (!currency || !params) return false;

  const poolCurrency =
    extrinsicType.value === 'removeLiquidity'
      ? {
          ...currency,
          balances: currency.balances.map((item) => ({
            ...item,
            transferable: params.asset2.tokenBalance,
          })),
        }
      : currency;

  const isValid = isValidAmountAsset(poolCurrency, networkName, '0', amount2.value);

  if (!isValid) return false;

  return isValidAmountAsset(currencyXOR.value, networkName, fee.value, '0');
});

const confirmBtnDisabled = computed(() => {
  if (showSettings.value) return false;

  if (step.value === 1 || step.value === 4) return false;

  if (step.value === 2) {
    if (+amount1.value === 0 && +amount2.value === 0) return true;

    if (!isValidAsset1.value || !isValidAsset2.value) return true;

    return fee.value === '';
  }

  return false;
});

const btnSecondText = computed(() => (showSettings.value ? 'assets.resetToDefault' : 'pools.remove'));

const btnText = computed(() => {
  if (showSettings.value) return 'common.save';

  if (step.value === 1) return 'pools.supply';

  if (step.value === 2) return 'assets.preview';

  if (step.value === 3) return 'common.confirm';

  return 'pools.supply';
});

const widthConfirmBtn = computed(() => (showSecondBtn.value ? '260px' : '530px'));

const showCloseIcon = computed(() => (showSettings.value ? true : step.value !== 2));

const showBackIcon = computed(() => {
  if (showSettings.value) return false;

  if (step.value === 4) return false;

  return step.value !== 1;
});

const showSecondBtn = computed(() => (showSettings.value ? true : !!poolParams.value?.isMyPool && step.value === 4));

const icon1 = computed(() => poolParams.value?.asset1.icon);
const icon2 = computed(() => poolParams.value?.asset2.icon);

const header = computed(() => {
  if (showSettings.value) return t('assets.poolSettings');

  if (step.value === 1 || step.value === 4) return t('pools.poolDetails');

  if (step.value === 2) {
    if (extrinsicType.value === 'addLiquidity') return t('pools.supplyLiquidity');

    return t('pools.removeLiquidity');
  }

  if (step.value === 3) return t('pools.confirmSupply');

  return '';
});

const tx = computed<RequestPool>(() => ({
  amount1: amount1.value,
  amount2: amount2.value,
  assetId1: poolParams.value?.asset1.id ?? '',
  assetId2: poolParams.value?.asset2.id ?? '',
  networkName: network.value,
  slippage: slippage.value,
}));

async function initializePool() {
  if (poolsStore.poolsItems.length === 0 && poolsStore.myPoolsItems.length === 0) {
    await poolsStore.getPoolsParams();
  }

  if (poolParams.value?.isMyPool) {
    step.value = 4;
  }
}

function toggleSettingsVisibility() {
  if (step.value !== 2) {
    closeForm();
  } else {
    showSettings.value = !showSettings.value;
    temporarySlippage.value = slippage.value;
  }
}

function handlerBack() {
  if (showSettings.value || step.value === 1) return;

  if (step.value === 2 && poolParams.value?.isMyPool) {
    step.value = 4;
    amount1.value = '';
    amount2.value = '';
  } else {
    step.value -= 1;
  }
}

function closeForm() {
  if (showSettings.value) {
    toggleSettingsVisibility();

    return;
  }

  router.back();
}

function secondBtnHandler() {
  if (showSettings.value) {
    temporarySlippage.value = 0.5;
    supply();

    return;
  }

  step.value = 2;
  extrinsicType.value = 'removeLiquidity';
}

function updateIsExchangeB(value: boolean) {
  isExchangeB.value = value;
}

function updateAmount1(value: string) {
  amount1.value = value;
}

function updateAmount2(value: string) {
  amount2.value = value;
}

function supply() {
  if (showSettings.value) {
    slippage.value = temporarySlippage.value;
    showSettings.value = false;

    return;
  }

  if (step.value === 1 || step.value === 4) {
    step.value = 2;
    extrinsicType.value = 'addLiquidity';

    return;
  }

  if (step.value === 3) {
    showConfirmationPasswordPopup.value = true;
  } else {
    step.value += 1;
  }
}

function confirmationPasswordPopupClose(closePopup: boolean) {
  showConfirmationPasswordPopup.value = false;

  if (closePopup) closeForm();
}

function updateSlippage(value: number) {
  temporarySlippage.value = value;
}

onMounted(() => {
  void initializePool();
});
</script>

<style lang="scss" scoped>
.pool-details {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;

  .activity-buttons {
    display: flex;
    margin: 15px 0 1px;
  }

  .remove-button {
    margin-right: 10px;
  }

  .warning {
    margin-top: 10px;
  }
}
</style>
