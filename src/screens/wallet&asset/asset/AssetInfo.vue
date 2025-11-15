<template>
  <Fragment>
    <ContentForm :height="160" :isStaticHeight="true" :bottomRightCorner="true">
      <div class="asset-info">
        <div class="asset__icon">
          <ExternalLogo :name="icon" :width="82" class="asset-logo" />
        </div>

        <div class="asset-info__content">
          <div class="asset__price">
            <div class="asset__price-item asset__price-item-change">
              <span :class="changePriceClasses">{{ priceChangeString }}</span>
              <span :class="changePriceClasses">{{ fiatPriceChangeString }}</span>
            </div>

            <span class="asset__price-item">{{ assetPriceString }}</span>

            <div v-if="showSettingsPopup" @click="toggleDetailsPopup">
              <Icon icon="three-dots-vertical" className="asset__price-details" />
            </div>
          </div>

          <Shimmer v-if="showShimmers" height="14px" width="120px" />

          <div v-else class="asset__balance" data-testid="assetBalance">{{ countAssetsString }}</div>

          <Shimmer v-if="showShimmers" height="14px" width="120px" />

          <span v-else class="asset__balance asset__balance--fiat" data-testid="fiatAssetBalance">
            {{ transferableFiatBalanceInNetworkString }}
          </span>

          <div class="asset__locked" @click="toggleBalanceDetailsPopup">
            <div class="asset__locked-content">
              <span class="asset__locked-title">{{ $t('assets.locked') }}</span>

              <Shimmer v-if="showShimmers" height="14px" width="60px" />

              <span v-else data-testid="lockedBalance">{{ lockedBalanceString }} </span>

              <Icon icon="info" class="details-icon" data-testid="lockedDetails" />
            </div>
          </div>
        </div>
      </div>
    </ContentForm>

    <BalanceDetailsPopup
      v-if="showBalanceDetailsPopup"
      :network="pickedNetwork"
      :currency="currency"
      :assetPrice="price"
      @closePopup="toggleBalanceDetailsPopup"
    />

    <AccountSettingsPopup
      v-if="showDetailsPopup"
      :selectedNetwork="selectedAssetNetwork"
      :showNodeSwitch="true"
      :showCopyAddress="false"
      :showExport="false"
      :showReplaceAccount="false"
      @handlerClose="toggleDetailsPopup"
    />
  </Fragment>
</template>
<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { APIItemState } from '@extension-base/api/types/networks';
import type { TokenGroup } from '@extension-base/background/types/types';
import type { AssetPrice } from '@/interfaces';
import { getSummaryTransferableBalanceFilteredByActiveNetworks } from '@/helpers/currencies';
import { getSummaryLockedBalance } from '@/helpers/common';
import BalanceDetailsPopup from '@/screens/wallet&asset/BalanceDetailsPopup.vue';
import AccountSettingsPopup from '@/screens/accounts/AccountSettingsPopup.vue';
import { useAccountsStore } from '@/stores/accounts';

const props = defineProps<{
  price: AssetPrice;
  currency: TokenGroup;
}>();

const accountsStore = useAccountsStore();
const route = useRoute();
const { n } = useI18n();

const showBalanceDetailsPopup = ref(false);
const showDetailsPopup = ref(false);
const transferableAssetBalance = ref(0);

const selectedAssetNetwork = computed(() => route.params.selectedNetwork as string | undefined);

const pickedNetwork = computed(() => selectedAssetNetwork.value ?? accountsStore.selectedNetwork);

const showShimmers = computed(
  () => !navigator.onLine || !props.currency.balances?.some(({ state }) => state === APIItemState.READY)
);

const icon = computed(() => props.currency?.icon ?? '');

const showSettingsPopup = computed(() => {
  if (accountsStore.selectedWallet.isTon) return false;

  return selectedAssetNetwork.value !== '' && selectedAssetNetwork.value !== undefined;
});

const priceChangeString = computed(() => n(props.price.priceChange, 'percent'));

const transferableFiatBalance = computed(() => transferableAssetBalance.value * props.price.price);

const fiatPriceChangeString = computed(
  () => `(${accountsStore.fiatSymbol}${n(transferableFiatBalance.value * props.price.priceChange, 'price')})`
);

const changePriceClasses = computed(() => {
  const classes = ['price-change'];

  if (props.price.priceChange > 0) classes.push('up-price');
  else if (props.price.priceChange < 0) classes.push('down-price');

  return classes;
});

const selectedAsset = computed(() => props.currency.symbol?.toLowerCase() ?? '');
const selectedAssetUpper = computed(() => selectedAsset.value.toUpperCase());

const assetPriceString = computed(
  () => `1 ${selectedAssetUpper.value} = ${accountsStore.fiatSymbol}${n(props.price.price, 'price')}`
);

const lockedBalanceString = computed(() => {
  const lockedBalance = getSummaryLockedBalance(props.currency);

  return `${n(lockedBalance, 'decimal')} ${selectedAssetUpper.value}`;
});

const transferableFiatBalanceInNetworkString = computed(
  () => `${accountsStore.fiatSymbol} ${n(transferableFiatBalance.value ?? 0, 'price')}`
);

const countAssetsString = computed(() => {
  const total = n(transferableAssetBalance.value ?? 0, 'decimal');

  return `${total} ${selectedAssetUpper.value}`;
});

function updateTransferableAssetBalance() {
  transferableAssetBalance.value = +getSummaryTransferableBalanceFilteredByActiveNetworks(
    props.currency,
    pickedNetwork.value
  );
}

watch([pickedNetwork, () => props.currency], updateTransferableAssetBalance, { immediate: true, deep: true });

function toggleBalanceDetailsPopup() {
  showBalanceDetailsPopup.value = !showBalanceDetailsPopup.value;
}

function toggleDetailsPopup() {
  showDetailsPopup.value = !showDetailsPopup.value;
}
</script>

<style lang="scss" scoped>
.asset-info {
  display: flex;
  align-items: center;
  height: 100%;
  gap: 20px;

  .asset__icon {
    background: $secondary-background-color;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 14px;
    margin: 16px;

    .asset-logo {
      border-radius: 50%;
    }
  }

  .asset-info__content {
    display: flex;
    justify-content: space-between;
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;

    &:hover {
      cursor: pointer;
    }

    .asset__price {
      display: flex;
      flex-flow: row nowrap;
      color: $gray-color;
      line-height: 1px;

      .asset__price-item {
        font-size: 0.75rem;
        font-weight: 400;
        border-right: solid 1px transparent;
        padding: 4px;
      }

      .asset__price-details {
        width: 24px;
        height: 24px;
        position: absolute;
        top: 15px;
        right: 10px;
        color: $default-white;
      }

      .asset__price-item-change {
        display: flex;
        flex-flow: row nowrap;
        gap: 4px;
      }

      > :first-child {
        border-right: solid 1px $gray-color;
        line-height: 1px;
        padding-left: 0px;
      }
    }

    .asset__balance {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 1.375em;
      font-style: normal;
      font-weight: 700;

      &--fiat {
        font-size: 1.125em;
      }
    }

    .asset__locked-content {
      display: flex;
      gap: 6px;
      align-items: center;

      .asset__locked-title {
        color: $default-white;
      }

      .details-icon {
        width: 14px;
        height: 14px;
        min-height: 14px;
        min-width: 14px;
        color: $grayish-white;

        &:hover {
          color: $default-white;
        }
      }
    }
  }
}
</style>
