<template>
  <AboveForm :fullScreen="true" :header="network" @closeHandler="closeStake">
    <div class="my-stake">
      <div class="action-buttons">
        <BorderButton
          class="action-button"
          text="staking.bondExtra"
          iconName="stake"
          @click="toggleVisible('showBondExtraForm', true)"
        />

        <BorderButton
          class="action-button"
          text="staking.unstake"
          iconName="unbond"
          @click="toggleVisible('showUnbondForm', true)"
        />

        <BorderButton
          class="action-button"
          text="staking.redeem"
          iconName="redeem"
          @click="toggleVisible('showRedeemForm', true)"
        />

        <div class="menu">
          <Dropdown :options="actionOptions" @handler="openForm" type="dots" />
        </div>
      </div>

      <ContentForm :height="450">
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

      <MainStakingForm
        v-if="showMainStakingForm"
        :stakingCurrency="stakingCurrency"
        :rewardedCurrency="rewardedCurrency"
        :type="type"
        :network="network"
        @closeForm="closeStakingManagement"
      />

      <YourValidatorsManagement
        v-if="showYourValidatorsForm"
        :stakingCurrency="stakingCurrency"
        :network="network"
        @closeForm="toggleVisible('showYourValidatorsForm', false)"
      />

      <ControllerAccount
        v-if="showControllerAccountForm"
        :network="network"
        @closeForm="toggleVisible('showControllerAccountForm', false)"
      />

      <PendingRewardForm
        v-if="showPendingRewardForm"
        :stakingCurrency="stakingCurrency"
        :rewardedCurrency="rewardedCurrency"
        @closeForm="toggleVisible('showPendingRewardForm', false)"
      />
    </div>
  </AboveForm>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import type { MyStakingTab } from '@/interfaces/common';
import type { TokenBalance } from '@extension-base/background/types/types';
import MyStakeSettings from '@/screens/staking/myStake/MyStakeSettings.vue';
import About from '@/screens/staking/myStake/About.vue';
import Alerts from '@/screens/staking/myStake/Alerts.vue';
import History from '@/screens/staking/myStake/History.vue';
import MainStakingForm from '@/screens/staking/myStake/stakingForms/MainStakingForm.vue';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { getUtilityAsset } from '@/helpers/currencies';
import { SORA_REWARD_ASSET } from '@/consts/sora';
import YourValidatorsManagement from '@/screens/staking/myStake/validators/YourValidatorsManagement.vue';
import ControllerAccount from '@/screens/staking/myStake/ControllerAccount.vue';
import PendingRewardForm from '@/screens/staking/myStake/rewards/PendingRewardForm.vue';
import { isSora } from '@/helpers';
import { Components } from '@/router/routes';

type ShowField = 'showBondForm' | 'showBondExtraForm' | 'showUnbondForm' | 'showRedeemForm' | 'showYourValidatorsForm';

@Component({
  components: {
    About,
    Alerts,
    History,
    MyStakeSettings,
    MainStakingForm,
    PendingRewardForm,
    ControllerAccount,
    YourValidatorsManagement,
  },
})
export default class MyStake extends Vue {
  readonly actionOptions = [
    { label: 'staking.rebond', value: 'showRebondForm' },
    { label: 'staking.yourValidators', value: 'showYourValidatorsForm' },
    { label: 'staking.controllerAccount', value: 'showControllerAccountForm' },
    { label: 'staking.pendingRewards', value: 'showPendingRewardForm' },
  ];

  activeTabName: MyStakingTab = 'about';
  showBondForm = false; // TODO удалить бонд из моего стейка
  showBondExtraForm = false;
  showUnbondForm = false;
  showRedeemForm = false;
  showRebondForm = false;
  showYourValidatorsForm = false;
  showControllerAccountForm = false;
  showPendingRewardForm = false;

  @Getter(AccountsGettersTypes.fiatSymbol) fiatSymbol!: string;
  @Getter(AccountsGettersTypes.getBalances) balances!: TokenBalance[];

  get showMainStakingForm() {
    return (
      this.showBondForm || this.showBondExtraForm || this.showUnbondForm || this.showRedeemForm || this.showRebondForm
    );
  }

  get type() {
    if (this.showBondForm) return 'bond';

    if (this.showBondExtraForm) return 'bondExtra';

    if (this.showUnbondForm) return 'unbond';

    if (this.showRebondForm) return 'rebond';

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
    if (isSora(this.network)) {
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

  updateActiveTabName(name: MyStakingTab) {
    this.activeTabName = name;
  }

  closeStakingManagement() {
    this.showBondForm = false;
    this.showBondExtraForm = false;
    this.showUnbondForm = false;
    this.showRedeemForm = false;
    this.showRebondForm = false;
  }

  toggleVisible(field: ShowField, value: boolean) {
    this[field] = value;
  }

  openForm(field: ShowField) {
    this[field] = true;
  }

  closeStake() {
    this.$router.push({ name: Components.Staking });
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

  .action-buttons {
    display: flex;
    justify-content: space-between;
    margin-bottom: 10px;

    .action-button {
      flex-grow: 1;
      margin-left: 5px;

      &:first-child {
        margin-left: 0;
      }
    }

    .menu {
      display: flex;
      flex-direction: column;
      justify-content: center;
      margin-left: 10px;
    }
  }
}
</style>
