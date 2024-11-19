<template>
  <ContentForm :height="250" :isStaticHeight="true" :bottomRightCorner="true">
    <div class="my-staking-item" @click="openStakingInfo">
      <div class="header">
        <div class="description-part left-part">
          <ExternalLogo :name="icon" class="network-icon" />

          <div class="network-description">
            <div class="network-name" data-testid="networkName">{{ network }}</div>
          </div>
        </div>

        <div class="description-part right-part">
          <Loading v-if="isLoading" :width="28" />

          <template v-else>
            <div class="fiat" data-testid="fiat">{{ accountsStore.fiatSymbol }}{{ fiatValue }}</div>

            <Icon icon="chevron-right" class="chevron" data-testid="stakingDetails" />
          </template>
        </div>
      </div>

      <div class="row">
        <div data-testid="stakingBalanceTitle">
          {{ $t('staking.stakingBalance') }}
        </div>

        <Loading v-if="isLoading" :width="28" />

        <div v-else class="value" data-testid="stakingBalanceValue">{{ totalStake }} {{ asset }}</div>
      </div>

      <div class="row">
        <div data-testid="unstakingTitle">
          {{ $t('staking.unstaking') }}
        </div>

        <Loading v-if="isLoading" :width="28" />

        <div v-else class="value" data-testid="unstakingValue">{{ unbondAmount }} {{ asset }}</div>
      </div>

      <div class="row">
        <div data-testid="apyTitle">APY</div>

        <Loading v-if="isLoading" :width="28" />

        <div v-else class="value" data-testid="apyValue">{{ apy }}</div>
      </div>

      <div class="row">
        <div data-testid="unstakingPeriodTitle">
          {{ $t('staking.unstakingPeriod') }}
        </div>

        <Loading v-if="isLoading" :width="28" />

        <div v-else class="value" data-testid="unstakingPeriodValue">{{ period }}</div>
      </div>
    </div>
  </ContentForm>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import type { NetworkParams } from '@/stores';
import { Components } from '@/router/routes';
import { getCostOfAssets } from '@/controllers/transferHelpers';
import { getUtilityAsset } from '@/helpers/currencies';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

@Component
export default class MyStakingItem extends Vue {
  networksStore = useNetworksStore();
  accountsStore = useAccountsStore();

  @Prop(Object) stakingNetwork!: NetworkParams;

  get fiatValue() {
    const stakingCurrency = getUtilityAsset(this.accountsStore.balances, this.network);
    const priceId = stakingCurrency?.priceId ?? '';
    const price = this.networksStore.getAssetPrice(priceId).price;
    const value = getCostOfAssets(this.totalStake, price, 'string').toString();

    return this.$n(+value, 'price');
  }

  get network() {
    return this.stakingNetwork.network;
  }

  get icon() {
    return this.stakingNetwork.icon;
  }

  get unbondPeriod() {
    return this.stakingNetwork.unbondPeriod;
  }

  get unbondAmount() {
    return this.stakingNetwork.unbond.sum;
  }

  get asset() {
    return this.stakingNetwork.asset;
  }

  get isLoading() {
    return this.stakingNetwork.loading;
  }

  get apy() {
    return `${this.$n(this.stakingNetwork.apy, 'price')}%`;
  }

  get period() {
    return `${this.unbondPeriod} ${this.$t('common.days')}`;
  }

  get totalStake() {
    return this.stakingNetwork.totalStake;
  }

  openStakingInfo() {
    if (!this.isLoading)
      this.$router.push({
        name: Components.MyStake,
        params: {
          network: this.network.toLowerCase(),
          paramsLoaded: 'true',
        },
      });
  }
}
</script>

<style lang="scss" scoped>
.my-staking-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 20px 0 0 15px;
  margin-right: 16px;
  user-select: none;
  cursor: pointer;

  .row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: $default-border;
    font-size: 0.875em;
    text-align: left;
    padding: 5px 0;
    min-height: 45px;
    width: 100%;
    color: $default-white;

    &:last-child {
      border-bottom: none;
    }

    .value {
      font-weight: 600;
      text-align: right;
      text-transform: uppercase;
      display: flex;
      flex-direction: row;
      align-items: center;
    }
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 15px;
    width: 100%;

    .left-part {
      justify-content: start;
      text-transform: uppercase;

      .network-icon {
        margin-right: 13px;
      }

      .network-description {
        display: flex;
        justify-content: space-between;
        flex-direction: column;

        .stake-name {
          font-size: 0.75em;
          font-weight: 700;
          text-align: left;
        }

        .network-name {
          font-size: 1.25em;
          font-weight: 700;
          line-height: 25px;
          text-align: left;
        }
      }
    }

    .right-part {
      justify-content: end;

      .chevron {
        width: 30px;
        height: 30px;
        margin-left: 8px;
        color: $grayish-white-2;
      }

      .fiat {
        font-weight: 700;
      }
    }

    .description-part {
      display: flex;
      align-items: center;
    }
  }
}
</style>
