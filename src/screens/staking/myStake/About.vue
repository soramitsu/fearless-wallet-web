<template>
  <div>
    <ContentForm :height="210" :isStaticHeight="true" :bottomRightCorner="true" class="about-form">
      <div class="about-stake">
        <div class="one block">
          <div class="label">{{ $t('staking.stakingActiveBalance') }}</div>
          <div class="amount">{{ activeStake }} {{ stakingAssetName }}</div>
          <div class="value">{{ fiatSymbol }}{{ activeStakeValue }}</div>
        </div>

        <div class="two block">
          <div class="label">{{ $t('staking.rewarded') }}</div>

          <Loading v-if="isLoading" class="loading" />

          <div v-else class="amount">{{ $n(rewardAmount, 'decimal') }} {{ rewardedAsset }}</div>

          <div class="value">{{ fiatSymbol }}{{ rewardedValue }}</div>
        </div>

        <div class="three block">
          <div class="label">{{ $t('staking.unstaking') }}</div>
          <div class="amount">
            {{ unbondAmount }} {{ stakingAssetName }}

            <template v-if="showUnbondDetails">
              <Icon icon="info" class="info-unbond" />

              <Tooltip :text="unbondDetails" target=".info-unbond" />
            </template>
          </div>
          <div class="value">{{ fiatSymbol }}{{ unbondValue }}</div>
        </div>

        <div class="four block">
          <div class="label">{{ $t('staking.redeemable') }}</div>
          <div class="amount">{{ redeemAmount }} {{ stakingAssetName }}</div>
          <div class="value">{{ fiatSymbol }}{{ redeemableValue }}</div>
        </div>
      </div>
    </ContentForm>

    <div class="about-label">
      {{ $t('common.about') }}
    </div>

    <div class="descriptions">
      {{ $t('staking.about') }}
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import type { MyStakingTab } from '@/interfaces/common';
import type { GetAssetPrice, GetStakingNetwork, SelectedWallet, type GetStakingHistory } from '@/store';
import type { TokenBalance } from '@extension-base/background/types/types';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { GettersTypes as StakingGettersTypes } from '@/store/staking/getters';
import { type SoraHistoryElement } from '@/interfaces';

@Component
export default class About extends Vue {
  readonly dotsVerticalRef = 'dotsVertical';
  activeTabName: MyStakingTab = 'about';
  isLoading = false;

  @Prop({ type: Object }) stakingCurrency!: TokenBalance;
  @Prop({ type: Object }) rewardedCurrency!: TokenBalance;
  @Prop({ type: String }) network!: string;
  @Getter(AccountsGettersTypes.fiatSymbol) fiatSymbol!: string;
  @Getter(AccountsGettersTypes.getBalances) balances!: TokenBalance[];
  @Getter(AccountsGettersTypes.selectedWallet) selectedWallet!: SelectedWallet;
  @Getter(NetworksGettersTypes.getAssetPrice) getAssetPrice!: GetAssetPrice;
  @Getter(StakingGettersTypes.getStakingNetwork) getStakingNetwork!: GetStakingNetwork;
  @Getter(StakingGettersTypes.getStakingHistory) getStakingHistory!: GetStakingHistory;

  get history() {
    return this.getStakingHistory(
      this.network,
      this.stakingCurrency.assetId,
      this.stakingNetwork.stashAddress,
      this.stakingNetwork.payeeAddress
    );
  }

  get unbondDetails() {
    const unbond = this.stakingNetwork.unbond;
    const asset = this.stakingNetwork.asset.toUpperCase();
    const base = `${this.$t('staking.unbond')} ${unbond.sum} ${asset}:`;

    return unbond.unlocking.reduce((result, { value, remainingDays }) => {
      return `
        ${result}
          <p>- ${value} ${asset} ${remainingDays} ${this.$t('staking.daysLeft')}</p>
      `;
    }, base);
  }

  get stakingNetwork() {
    return this.getStakingNetwork(this.network);
  }

  get activeStake() {
    return this.$n(+this.stakingNetwork.activeStake, 'decimal');
  }

  get rewardAmount() {
    return (this.history as SoraHistoryElement[])
      .filter(({ method }) => method === 'rewarded')
      .reduce((result, { data }) => {
        result = result + +(data?.amount ?? 0);

        return result;
      }, 0);
  }

  get showUnbondDetails() {
    return this.stakingNetwork.unbond.unlocking.length !== 0;
  }

  get unbondAmount() {
    return this.$n(+this.stakingNetwork.unbond.sum, 'decimal');
  }

  get redeemAmount() {
    return this.$n(+this.stakingNetwork.redeemAmount, 'decimal');
  }

  get stakingAssetName() {
    return this.stakingCurrency?.symbol;
  }

  get rewardedAsset() {
    return this.rewardedCurrency?.symbol;
  }

  get stakingAssetPrice() {
    const priceId = this.stakingCurrency?.priceId ?? '';

    return this.getAssetPrice(priceId).price;
  }

  get rewardedAssetPrice() {
    const priceId = this.rewardedCurrency?.priceId ?? '';

    return this.getAssetPrice(priceId).price;
  }

  get activeStakeValue() {
    const value = +this.stakingNetwork.activeStake * this.stakingAssetPrice;

    return this.$n(value, 'price');
  }

  get rewardedValue() {
    const value = +this.rewardAmount * this.rewardedAssetPrice;

    return this.$n(value, 'price');
  }

  get unbondValue() {
    const value = +this.stakingNetwork.unbond.sum * this.stakingAssetPrice;

    return this.$n(value, 'price');
  }

  get redeemableValue() {
    const value = +this.stakingNetwork.redeemAmount * this.stakingAssetPrice;

    return this.$n(value, 'price');
  }
}
</script>

<style lang="scss" scoped>
.about-label {
  font-weight: 600;
  color: $default-white;
  margin: 15px 0;
  text-align: left;
}

.descriptions {
  font-size: 14px;
  color: $default-white;
  text-align: left;
  line-height: 20px;
}

.about-form {
  margin-top: 10px;

  .about-stake {
    display: grid;
    grid-auto-columns: 247px;
    grid-auto-rows: 105px;
    text-transform: uppercase;

    .block {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      justify-content: center;
      text-align: left;
      padding-left: 35px;
    }

    .label {
      font-size: 12px;
      font-weight: 600;
      text-align: left;
      color: $grayish-white;
      margin-bottom: 5px;
    }

    .amount {
      font-size: 20px;
      font-weight: 600;
      margin-bottom: 5px;
      height: 23px;
    }

    .value {
      font-size: 14px;
      color: $grayish-white;
    }

    .one {
      grid-column: 1;
      grid-row: 1;
      border-right: $default-border;
      border-bottom: $default-border;
    }

    .two {
      grid-column: 2;
      grid-row: 1;
      border-bottom: $default-border;
    }

    .three {
      grid-column: 1;
      grid-row: 2;
      border-right: $default-border;
    }

    .four {
      grid-column: 2;
      grid-row: 2;
    }

    .info-unbond {
      height: 18px;
      width: 18px;
      margin-left: 10px;
    }

    .loading {
      height: 23px;
      margin-bottom: 5px;
    }
  }
}
</style>
