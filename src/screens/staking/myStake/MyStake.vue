<template>
  <div class="my-stake">
    <div class="header">
      <div class="left-part">
        <CircleButton backgroundColor="light-black" iconName="chevron-left" @click.stop="backToStaking" />

        <div class="network">
          {{ network }}
        </div>
      </div>

      <CircleButton
        :ref="dotsVerticalRef"
        size="big"
        iconName="dots-vertical"
        backgroundColor="none"
        backgroundColorHover="light-black"
        @click="openAccountSettingsPopup(network)"
      />
    </div>

    <div class="activity">
      <BorderButton
        class="activity-button"
        text="staking.stakeMore"
        iconName="stake"
        @click="toggleVisible('showStakingForm', true)"
      />

      <BorderButton
        class="activity-button"
        text="staking.unstake"
        iconName="unstake"
        @click="toggleVisible('showUnstakingForm', true)"
      />

      <BorderButton
        class="activity-button"
        text="staking.redeem"
        iconName="redeem"
        @click="toggleVisible('showRedeemForm', true)"
      />

      <BorderButton class="activity-button" text="validators" @click="toggleVisible('showYourValidators', true)" />
    </div>

    <ContentForm :height="329">
      <Scroll>
        <div class="content">
          <MyStakeSettings :activeTabName="activeTabName" @update:activeTabName="updateActiveTabName" />

          <About
            v-if="isAbout"
            :stakingCurrency="stakingCurrency"
            :rewardedCurrency="rewardedCurrency"
            :stakingAmount="stakingAmount"
            :rewardedAmount="rewardedAmount"
            :unstakingAmount="unstakingAmount"
            :redeemableAmount="redeemableAmount"
          />

          <Alerts v-else-if="isAlerts" :alerts="alerts" />

          <History v-else-if="isHistory" :history="history" />
        </div>
      </Scroll>
    </ContentForm>

    <StakingManagement
      v-if="showStakeForm"
      :stakingCurrency="stakingCurrency"
      :rewardedCurrency="rewardedCurrency"
      :type="type"
      :network="network"
      @closeForm="closeStakeForm"
    />

    <YourValidatorsManagement
      v-if="showYourValidators"
      :stakingCurrency="stakingCurrency"
      @closeForm="toggleVisible('showYourValidators', false)"
    />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Watch } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import type { MyStakingTab } from '@/interfaces/common';
import MyStakeSettings from '@/screens/staking/myStake/MyStakeSettings.vue';
import About from '@/screens/staking/myStake/About.vue';
import Alerts from '@/screens/staking/myStake/Alerts.vue';
import History from '@/screens/staking/myStake/History.vue';
import StakingManagement from '@/screens/staking/myStake/stakingForms/StakingManagement.vue';
import { Components } from '@/router/routes';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { TokenBalance } from '@/extension/background/extension-base/src/background/types/types';
import { getUtilityAsset } from '@/helpers/currencies';
import { SORA_NETWORK_NAME, SORA_REWARD_ASSET } from '@/consts/sora';
import YourValidatorsManagement from '@/screens/staking/myStake/validators/YourValidatorsManagement.vue';

type ShowField = 'showStakingForm' | 'showUnstakingForm' | 'showRedeemForm' | 'showYourValidators';

@Component({
  components: {
    About,
    Alerts,
    History,
    MyStakeSettings,
    StakingManagement,
    YourValidatorsManagement,
  },
})
export default class MyStake extends Vue {
  readonly dotsVerticalRef = 'dotsVertical';
  activeTabName: MyStakingTab = 'about';
  showStakingForm = false;
  showUnstakingForm = false;
  showRedeemForm = false;
  showYourValidators = false;

  @Getter(AccountsGettersTypes.fiatSymbol) fiatSymbol!: string;
  @Getter(AccountsGettersTypes.getBalances) balances!: TokenBalance[];

  get showStakeForm() {
    return this.showStakingForm || this.showUnstakingForm || this.showRedeemForm;
  }

  get type() {
    if (this.showStakingForm) return 'staking';

    if (this.showUnstakingForm) return 'unstaking';

    return 'redeem';
  }

  get isAbout() {
    return this.activeTabName === 'about';
  }

  get isAlerts() {
    return this.activeTabName === 'alerts';
  }

  get isHistory() {
    return this.activeTabName === 'history';
  }

  get alerts() {
    return [
      {
        name: 'Change your validators',
        descriptions:
          'Staking was inactive. None of your validators were elected by network. One of your validators was slashed.',
        timespan: Date.now(),
      },

      {
        name: 'Stake more tokens',
        descriptions: 'Staking was inactive. Current minimum stake is 0.00003 KSM ($0.01)',
        timespan: Date.now() - 100000,
      },
    ];
  }

  get history() {
    return [
      {
        name: 'Reward',
        amount: '154.51',
        asset: 'val',
        timespan: Date.now(),
        assetId: '24d0809e-0a4c-42ea-bdd8-dc7a518f389c',
      },
      {
        name: 'Stake more tokens',
        amount: '5.3811',
        asset: 'xor',
        timespan: Date.now() - 10000000,
        assetId: 'b774c386-5cce-454a-a845-1ec0381538ec',
      },
      {
        name: 'Unstake',
        amount: '1.26',
        asset: 'xor',
        timespan: Date.now() - 1000000000,
        assetId: 'b774c386-5cce-454a-a845-1ec0381538ec',
      },
      {
        name: 'Start staking',
        amount: '11',
        asset: 'xor',
        timespan: Date.now() - 2000000000,
        assetId: 'b774c386-5cce-454a-a845-1ec0381538ec',
      },
    ];
  }

  get network() {
    return this.$route.params.network;
  }

  get stakingAssetId() {
    if (this.balances.length === 0) return '';

    const { assetId } = getUtilityAsset(this.balances, this.network);

    return assetId;
  }

  get rewardedAssetId() {
    if (this.network === SORA_NETWORK_NAME) {
      const { assetId } = this.balances.find(({ symbol }) => symbol === SORA_REWARD_ASSET)!;

      return assetId;
    }

    // стейкается всегда утилити токен, он же является ревард токеном
    return this.stakingAssetId;
  }

  get stakingCurrency() {
    return this.balances.find(({ assetId }) => assetId === this.stakingAssetId);
  }

  get rewardedCurrency() {
    return this.balances.find(({ assetId }) => assetId === this.rewardedAssetId);
  }

  get stakingAmount() {
    return '10.00003';
  }

  get rewardedAmount() {
    return '0.49191';
  }

  get unstakingAmount() {
    return '2.3';
  }

  get redeemableAmount() {
    return '1.42';
  }

  //TODO
  @Watch('kek')
  updateZIndexDotsVertical(value: boolean) {
    const targetElement = (this.$refs[this.dotsVerticalRef] as Vue)?.$el as HTMLElement;

    if (targetElement) targetElement.style.zIndex = value ? '200' : '0';
  }

  updateActiveTabName(name: MyStakingTab) {
    this.activeTabName = name;
  }

  backToStaking() {
    this.$router.push({ name: Components.Staking });
  }

  closeStakeForm() {
    this.showStakingForm = false;
    this.showUnstakingForm = false;
    this.showRedeemForm = false;
    this.showYourValidators = false;
  }

  toggleVisible(field: ShowField, value: boolean) {
    this[field] = value;
  }
}
</script>

<style lang="scss" scoped>
.my-stake {
  .content {
    padding: $default-padding $default-padding 0;
    height: 100%;
    display: flex;
    flex-direction: column;

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
        padding: 10px 0 0 35px;
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
    }
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 50px;
    margin-bottom: 15px;

    .left-part {
      display: flex;
      align-items: center;

      .network {
        font-size: 24px;
        font-weight: 600;
        text-transform: uppercase;
        margin-left: 15px;
      }
    }
  }

  .activity {
    display: flex;
    justify-content: space-between;
    margin-bottom: 10px;

    .activity-button {
      flex-grow: 1;
      margin-left: 5px;

      &:first-child {
        margin-left: 0;
      }
    }
  }
}
</style>
