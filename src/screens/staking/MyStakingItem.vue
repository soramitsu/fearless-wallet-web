<template>
  <ContentForm :height="250" :isStaticHeight="true" :bottomRightCorner="true">
    <div class="my-staking-item" @click="openStakingInfo">
      <div class="header">
        <div class="description-part left-part">
          <ExternalLogo :name="icon" class="network-icon" />

          <div class="network-description">
            <div class="network-name">{{ network }}</div>
          </div>
        </div>

        <div class="description-part right-part">
          <Loading v-if="isLoading" :width="28" />

          <template v-else>
            <div class="fiat">{{ fiatSymbol }}{{ fiatValue }}</div>

            <Icon icon="chevron-right" class="chevron" />
          </template>
        </div>
      </div>

      <div class="row">
        <div>
          {{ $t('staking.stakingBalance') }}
        </div>

        <Loading v-if="isLoading" :width="28" />

        <div v-else class="value">{{ totalStake }} {{ asset }}</div>
      </div>

      <div class="row">
        <div>
          {{ $t('staking.unstaking') }}
        </div>

        <Loading v-if="isLoading" :width="28" />

        <div v-else class="value">{{ unbondAmount }} {{ asset }}</div>
      </div>

      <div class="row">
        <div>APY</div>

        <Loading v-if="isLoading" :width="28" />

        <div v-else class="value">{{ apy }}</div>
      </div>

      <div class="row">
        <div>
          {{ $t('staking.unstakingPeriod') }}
        </div>

        <Loading v-if="isLoading" :width="28" />

        <div v-else class="value">{{ period }}</div>
      </div>
    </div>
  </ContentForm>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { type TokenBalance } from '@extension-base/background/types/types';
import type { NetworkJson } from '@extension-base/types';
import type { NetworkParams, GetAssetPrice } from '@/store';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { Components } from '@/router/routes';
import { getCostOfAssets } from '@/controllers/transferHelpers';
import { getUtilityAsset } from '@/helpers/currencies';

@Component
export default class MyStakingItem extends Vue {
  @Prop(Object) networkParams!: NetworkParams;
  @Getter(AccountsGettersTypes.fiatSymbol) fiatSymbol!: string;
  @Getter(AccountsGettersTypes.getBalances) balances!: TokenBalance[];
  @Getter(NetworksGettersTypes.getAssetPrice) getAssetPrice!: GetAssetPrice;
  @Getter(NetworksGettersTypes.networks) networks!: NetworkJson[];

  get fiatValue() {
    const stakingCurrency = getUtilityAsset(this.balances, this.network);
    const priceId = stakingCurrency?.priceId ?? '';
    const price = this.getAssetPrice(priceId).price;

    return getCostOfAssets(this.totalStake, price).toString();
  }

  get network() {
    return this.networkParams.network;
  }

  get icon() {
    return this.networkParams.icon;
  }

  get unbondPeriod() {
    return this.networkParams.unbondPeriod;
  }

  get unbondAmount() {
    return this.networkParams.unbond.sum;
  }

  get asset() {
    return this.networkParams.asset;
  }

  get isLoading() {
    return this.networkParams.loading;
  }

  get apy() {
    return `${this.$n(this.networkParams.apy, 'price')}%`;
  }

  get changeBalance() {
    const value = 40.51;

    return `+${this.fiatSymbol}${value}`;
  }

  get changeStakingAmount() {
    const value = 1.2;

    return `+${this.fiatSymbol}${value}`;
  }

  get changeAmount() {
    const value = 40.51;

    return `+${this.fiatSymbol}${value}`;
  }

  get period() {
    return `${this.unbondPeriod} ${this.$t('staking.days')}`;
  }

  get totalStake() {
    return this.networkParams.totalStake;
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
    font-size: 14px;
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
          font-size: 12px;
          font-weight: 700;
          text-align: left;
        }

        .network-name {
          font-size: 20px;
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

  .change {
    color: $success-color;
    font-size: 12px;
    margin-right: 15px;
  }
}
</style>
