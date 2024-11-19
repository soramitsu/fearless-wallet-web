<template>
  <AboveForm :fullScreen="true" :header="network" @closeHandler="closeStake">
    <div class="my-stake">
      <div class="action-buttons">
        <BorderButton
          v-if="showBondExtraBtn"
          class="action-button"
          text="staking.bondExtra"
          iconName="stake"
          data-testid="stakeMore"
          @click="toggleVisible('showBondExtraForm', true)"
        />

        <BorderButton
          v-if="showUnbondBtn"
          class="action-button"
          text="staking.unbond"
          iconName="unbond"
          data-testid="unstake"
          @click="toggleVisible('showUnbondForm', true)"
        />

        <BorderButton
          v-if="showRebondBtn"
          class="action-button"
          text="staking.rebond"
          iconName="rebond"
          data-testid="rebond"
          @click="toggleVisible('showRebondForm', true)"
        />

        <BorderButton
          v-if="showRedeemBtn"
          class="action-button"
          text="staking.redeem"
          iconName="redeem"
          data-testid="redeem"
          @click="toggleVisible('showRedeemForm', true)"
        />

        <BorderButton
          v-if="showValidatorsBtn"
          class="action-button"
          text="staking.yourValidators"
          iconName="validators"
          data-testid="validators"
          @click="toggleVisible('showYourValidatorsForm', true)"
        />

        <BorderButton
          v-if="showControllerBtn"
          class="action-button"
          text="staking.setController"
          iconName="controller"
          data-testid="controller"
          @click="toggleVisible('showControllerAccountForm', true)"
        />

        <div class="menu">
          <Dropdown
            v-if="showDropdown"
            :options="actionOptions"
            type="dots-vertical"
            data-testid="menu"
            @handler="openForm"
          />
        </div>
      </div>

      <ContentForm :height="0">
        <Scroll>
          <div class="content">
            <MyStakeSettings
              data-testid="myStakingSettings"
              :activeTabName="activeTabName"
              :showAlertTab="showAlertTab"
              @update:activeTabName="updateActiveTabName"
            />

            <About
              v-if="isAbout"
              data-testid="about"
              :stakingCurrency="stakingCurrency"
              :rewardedCurrency="rewardedCurrency"
              :network="network"
            />

            <Alerts v-else-if="isAlerts" data-testid="alerts" :alerts="alerts" @openForm="openForm" />

            <History
              v-else-if="isHistory"
              data-testid="history"
              :network="network"
              :stakingAssetId="stakingAssetId"
              :rewardedAssetId="rewardedAssetId"
              @openHistoryDetailsForm="openHistoryDetailsForm"
            />
          </div>
        </Scroll>
      </ContentForm>

      <MainStakingForm
        v-if="showMainStakingForm"
        :stakingCurrency="stakingCurrency"
        :rewardedCurrency="rewardedCurrency"
        :type="type"
        :stakingNetwork="stakingNetwork"
        @closeForm="closeStakingManagement"
      />

      <YourValidatorsManagement
        v-if="showYourValidatorsForm"
        :stakingCurrency="stakingCurrency"
        :stakingNetwork="stakingNetwork"
        @closeForm="toggleVisible('showYourValidatorsForm', false)"
      />

      <PendingRewardForm
        v-if="showPendingRewardForm"
        :stakingCurrency="stakingCurrency"
        :rewardedCurrency="rewardedCurrency"
        :stakingNetwork="stakingNetwork"
        @closeForm="toggleVisible('showPendingRewardForm', false)"
      />

      <HistoryDetailsForm
        v-if="showHistoryDetailsForm"
        :historyElement="historyElement"
        :assetId="stakingAssetId"
        :selectedNetwork="network"
        @handlerClose="closeHistoryDetailsForm"
      />
    </div>
  </AboveForm>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import type { MyStakingTab, HistoryElement } from '@/interfaces';
import MyStakeSettings from '@/screens/staking/myStake/MyStakeSettings.vue';
import About from '@/screens/staking/myStake/About.vue';
import Alerts from '@/screens/staking/myStake/Alerts.vue';
import History from '@/screens/staking/myStake/History.vue';
import MainStakingForm from '@/screens/staking/myStake/stakingForms/MainStakingForm.vue';
import { getUtilityAsset } from '@/helpers/currencies';
import { SORA_REWARD_ASSET } from '@/consts/sora';
import YourValidatorsManagement from '@/screens/staking/myStake/validators/YourValidatorsManagement.vue';
import PendingRewardForm from '@/screens/staking/myStake/rewards/PendingRewardForm.vue';
import { isSora } from '@/helpers';
import { Components } from '@/router/routes';
import HistoryDetailsForm from '@/screens/wallet&asset/asset/HistoryDetailsForm.vue';
import { useStakingStore } from '@/stores/staking';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

type ShowField =
  | 'showBondExtraForm'
  | 'showUnbondForm'
  | 'showRedeemForm'
  | 'showControllerAccountForm'
  | 'showPayeeForm'
  | 'showYourValidatorsForm';

@Component({
  components: {
    About,
    Alerts,
    History,
    MyStakeSettings,
    MainStakingForm,
    PendingRewardForm,
    HistoryDetailsForm,
    YourValidatorsManagement,
  },
})
export default class MyStake extends Vue {
  stakingStore = useStakingStore();
  networksStore = useNetworksStore();
  accountsStore = useAccountsStore();
  activeTabName: MyStakingTab = 'about';
  showBondExtraForm = false;
  showUnbondForm = false;
  showRedeemForm = false;
  showRebondForm = false;
  showControllerAccountForm = false;
  showYourValidatorsForm = false;
  showPayeeForm = false;
  showPendingRewardForm = false;
  historyElement: HistoryElement | Record<string, string> | null = null;

  get actionOptions() {
    return [
      {
        label: 'staking.yourValidators',
        value: 'showYourValidatorsForm',
        visibility: !this.showValidatorsBtn && !this.isOtherController,
      },
      {
        label: 'staking.setController',
        value: 'showControllerAccountForm',
        visibility: !this.showControllerBtn && !this.isController,
      },
      {
        label: 'staking.setPayee',
        value: 'showPayeeForm',
        visibility: this.isController || !this.isOtherController,
      },
      {
        label: 'staking.pendingRewards',
        value: 'showPendingRewardForm',
        visibility: this.isController || !this.isOtherController,
      },
    ];
  }

  get showAlertTab() {
    return this.alerts.length !== 0;
  }

  get showDropdown() {
    return this.actionOptions.some(({ visibility }) => visibility);
  }

  get isController() {
    return this.stakingNetwork.isController;
  }

  get isOtherController() {
    return this.stakingNetwork.isOtherController;
  }

  get showMainStakingForm() {
    return (
      this.showBondExtraForm ||
      this.showUnbondForm ||
      this.showRedeemForm ||
      this.showRebondForm ||
      this.showControllerAccountForm ||
      this.showPayeeForm
    );
  }

  get type() {
    if (this.showBondExtraForm) return 'bondExtra';

    if (this.showUnbondForm) return 'unbond';

    if (this.showRebondForm) return 'rebond';

    if (this.showRedeemForm) return 'redeem';

    if (this.showControllerAccountForm) return 'setController';

    if (this.showPayeeForm) return 'setPayee';

    return '';
  }

  get showHistoryDetailsForm() {
    return this.historyElement !== null;
  }

  get stakingNetwork() {
    return this.stakingStore.getStakingNetwork(this.network);
  }

  get showControllerBtn() {
    if (this.isController) return false;

    return this.isOtherController;
  }

  get showValidatorsBtn() {
    if (this.isOtherController) return false;

    return !(this.showRebondBtn || this.showRedeemBtn);
  }

  get showBondExtraBtn() {
    return !this.isController;
  }

  get showUnbondBtn() {
    if (this.isOtherController) return false;

    return this.stakingNetwork.activeStake !== '0';
  }

  get showRebondBtn() {
    if (this.isOtherController) return false;

    return this.stakingNetwork.unbond.sum !== '0';
  }

  get showRedeemBtn() {
    if (this.isOtherController) return false;

    return this.stakingNetwork.redeemAmount !== '0';
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
    return this.stakingNetwork.alerts;
  }

  get network() {
    return this.$route.params.network;
  }

  get stakingAssetId() {
    if (this.accountsStore.balances.length === 0) return '';

    const { groupId } = getUtilityAsset(this.accountsStore.balances, this.network);

    return groupId;
  }

  get rewardedAssetId() {
    if (isSora(this.network)) {
      const { groupId } = this.accountsStore.balances.find(({ symbol }) => symbol === SORA_REWARD_ASSET)!;

      return groupId;
    }

    // стейкается всегда утилити токен, он же является ревард токеном
    return this.stakingAssetId;
  }

  get stakingCurrency() {
    return this.accountsStore.balances.find(({ groupId }) => groupId === this.stakingAssetId);
  }

  get rewardedCurrency() {
    return this.accountsStore.balances.find(({ groupId }) => groupId === this.rewardedAssetId);
  }

  get history() {
    if (!this.network) return [];

    const stashHistory =
      this.networksStore.getHistory(this.stakingAssetId, this.network.toLowerCase(), this.stakingNetwork.stashAddress)
        ?.nodes ?? [];

    const payeeHistory =
      this.networksStore.getHistory(this.stakingAssetId, this.network.toLowerCase(), this.stakingNetwork.payeeAddress)
        ?.nodes ?? [];

    return [...stashHistory, ...payeeHistory];
  }

  created() {
    if (this.$route.params.paramsLoaded !== 'true') this.stakingStore.getStakingParams();

    this.loadHistory();
  }

  async loadHistory() {
    if (this.history.length !== 0) return;

    this.networksStore.fetchHistory({
      networkName: this.network,
      assetId: this.stakingAssetId,
      address: this.stakingNetwork.stashAddress,
    });

    if (this.stakingNetwork.isOtherPayee)
      this.networksStore.fetchHistory({
        networkName: this.network,
        assetId: this.stakingAssetId,
        address: this.stakingNetwork.payeeAddress,
      });
  }

  updateActiveTabName(name: MyStakingTab) {
    this.activeTabName = name;
  }

  closeStakingManagement() {
    this.showBondExtraForm = false;
    this.showUnbondForm = false;
    this.showRedeemForm = false;
    this.showRebondForm = false;
    this.showControllerAccountForm = false;
    this.showPayeeForm = false;
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

  openHistoryDetailsForm(historyElement: HistoryElement) {
    this.historyElement = historyElement;
  }

  closeHistoryDetailsForm() {
    this.historyElement = null;
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
        font-size: 0.75em;
        font-weight: 600;
        text-align: left;
        color: $grayish-white;
        margin-bottom: 5px;
      }

      .amount {
        font-size: 1.25em;
        font-weight: 600;
        margin-bottom: 5px;
      }

      .value {
        font-size: 0.875em;
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

.fw-web {
  .action-buttons {
    flex-wrap: wrap;
    gap: 10px;
  }
}
</style>
