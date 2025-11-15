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

      <ContentForm :height="450">
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

<script lang="ts" setup>
import { computed, onMounted, ref, type Ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
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

const stakingStore = useStakingStore();
const networksStore = useNetworksStore();
const accountsStore = useAccountsStore();
const route = useRoute();
const router = useRouter();

const activeTabName = ref<MyStakingTab>('about');
const showBondExtraForm = ref(false);
const showUnbondForm = ref(false);
const showRedeemForm = ref(false);
const showRebondForm = ref(false);
const showControllerAccountForm = ref(false);
const showYourValidatorsForm = ref(false);
const showPayeeForm = ref(false);
const showPendingRewardForm = ref(false);
const historyElement = ref<HistoryElement | Record<string, string> | null>(null);

type ShowField =
  | 'showBondExtraForm'
  | 'showUnbondForm'
  | 'showRedeemForm'
  | 'showRebondForm'
  | 'showControllerAccountForm'
  | 'showPayeeForm'
  | 'showYourValidatorsForm'
  | 'showPendingRewardForm';

const fieldRefs: Record<ShowField, Ref<boolean>> = {
  showBondExtraForm,
  showUnbondForm,
  showRedeemForm,
  showRebondForm,
  showControllerAccountForm,
  showPayeeForm,
  showYourValidatorsForm,
  showPendingRewardForm,
};

const network = computed(() => route.params.network as string);
const stakingNetwork = computed(() => stakingStore.getStakingNetwork(network.value));

const alerts = computed(() => stakingNetwork.value.alerts);

const isController = computed(() => stakingNetwork.value.isController);
const isOtherController = computed(() => stakingNetwork.value.isOtherController);

const showBondExtraBtn = computed(() => !isController.value);
const showUnbondBtn = computed(() => {
  if (isOtherController.value) return false;

  return stakingNetwork.value.activeStake !== '0';
});
const showRebondBtn = computed(() => {
  if (isOtherController.value) return false;

  return stakingNetwork.value.unbond.sum !== '0';
});
const showRedeemBtn = computed(() => {
  if (isOtherController.value) return false;

  return stakingNetwork.value.redeemAmount !== '0';
});
const showControllerBtn = computed(() => {
  if (isController.value) return false;

  return isOtherController.value;
});
const showValidatorsBtn = computed(() => {
  if (isOtherController.value) return false;

  return !(showRebondBtn.value || showRedeemBtn.value);
});

const actionOptions = computed(() => [
  {
    label: 'staking.yourValidators',
    value: 'showYourValidatorsForm',
    visibility: !showValidatorsBtn.value && !isOtherController.value,
  },
  {
    label: 'staking.setController',
    value: 'showControllerAccountForm',
    visibility: !showControllerBtn.value && !isController.value,
  },
  {
    label: 'staking.setPayee',
    value: 'showPayeeForm',
    visibility: isController.value || !isOtherController.value,
  },
  {
    label: 'staking.pendingRewards',
    value: 'showPendingRewardForm',
    visibility: isController.value || !isOtherController.value,
  },
]);

const showAlertTab = computed(() => alerts.value.length !== 0);
const showDropdown = computed(() => actionOptions.value.some(({ visibility }) => visibility));

const showMainStakingForm = computed(
  () =>
    showBondExtraForm.value ||
    showUnbondForm.value ||
    showRedeemForm.value ||
    showRebondForm.value ||
    showControllerAccountForm.value ||
    showPayeeForm.value
);

const type = computed<'bondExtra' | 'unbond' | 'rebond' | 'redeem' | 'setController' | 'setPayee' | ''>(() => {
  if (showBondExtraForm.value) return 'bondExtra';
  if (showUnbondForm.value) return 'unbond';
  if (showRebondForm.value) return 'rebond';
  if (showRedeemForm.value) return 'redeem';
  if (showControllerAccountForm.value) return 'setController';
  if (showPayeeForm.value) return 'setPayee';

  return '';
});

const showHistoryDetailsForm = computed(() => historyElement.value !== null);

const isAbout = computed(() => activeTabName.value === 'about');
const isAlerts = computed(() => activeTabName.value === 'alerts');
const isHistory = computed(() => activeTabName.value === 'history');

const stakingAssetId = computed(() => {
  if (accountsStore.balances.length === 0) return '';

  const { groupId } = getUtilityAsset(accountsStore.balances, network.value);

  return groupId;
});

const rewardedAssetId = computed(() => {
  if (isSora(network.value)) {
    const balance = accountsStore.balances.find(({ symbol }) => symbol === SORA_REWARD_ASSET);

    return balance?.groupId ?? '';
  }

  return stakingAssetId.value;
});

const stakingCurrency = computed(() => accountsStore.balances.find(({ groupId }) => groupId === stakingAssetId.value));
const rewardedCurrency = computed(() =>
  accountsStore.balances.find(({ groupId }) => groupId === rewardedAssetId.value)
);

const historyResult = computed(() =>
  stakingStore.getStakingHistory(
    network.value,
    stakingAssetId.value,
    stakingNetwork.value.stashAddress,
    stakingNetwork.value.payeeAddress
  )
);
const history = computed<HistoryElement[]>(() => (historyResult.value.entries ?? []) as HistoryElement[]);

const loadHistory = () => {
  if (history.value.length !== 0) return;
  if (!stakingAssetId.value) return;

  networksStore.fetchHistory({
    networkName: network.value,
    assetId: stakingAssetId.value,
    address: stakingNetwork.value.stashAddress,
  });

  if (stakingNetwork.value.isOtherPayee) {
    networksStore.fetchHistory({
      networkName: network.value,
      assetId: stakingAssetId.value,
      address: stakingNetwork.value.payeeAddress,
    });
  }
};

onMounted(() => {
  if (route.params.paramsLoaded !== 'true') stakingStore.getStakingParams();

  loadHistory();
});

const updateActiveTabName = (name: MyStakingTab) => {
  activeTabName.value = name;
};

const closeStakingManagement = () => {
  showBondExtraForm.value = false;
  showUnbondForm.value = false;
  showRedeemForm.value = false;
  showRebondForm.value = false;
  showControllerAccountForm.value = false;
  showPayeeForm.value = false;
};

const toggleVisible = (field: ShowField, value: boolean) => {
  fieldRefs[field].value = value;
};

const openForm = (field: ShowField) => {
  fieldRefs[field].value = true;
};

const closeStake = () => {
  router.push({ name: Components.Staking });
};

const openHistoryDetailsForm = (value: HistoryElement) => {
  historyElement.value = value;
};

const closeHistoryDetailsForm = () => {
  historyElement.value = null;
};
</script>

<style lang="scss" scoped>
.my-stake {
  .content {
    padding: $default-padding $default-padding 0;
    height: 100%;
    display: flex;
    flex-direction: column;
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
