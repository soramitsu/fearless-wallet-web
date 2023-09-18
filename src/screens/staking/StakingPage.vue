<template>
  <div class="staking">
    <header class="staking-header">
      <div class="balance-container">
        <div class="staking-balance">
          <span class="label"> {{ $t('staking.stakingBalance') }} </span>

          <WalletBalance class="balance" :balance="stakingBalance" />
        </div>

        <div class="balance-loading">
          <Loading v-if="showShimmers" :width="28" />
        </div>
      </div>
    </header>

    <ContentForm :height="375">
      <div class="content">
        <StakingSettings
          :activeTabName="activeTabName"
          :filterValue="filterValue"
          @update:filterValue="updateFilterValue"
          @update:activeTabName="updateActiveTabName"
        />

        <Scroll>
          <template v-if="isAllTab">
            <StakingItem
              v-for="{ network, icon, type, unbondPeriod } in stakingItems"
              :key="network"
              :network="network"
              :type="type"
              :icon="icon"
              :unbondPeriod="unbondPeriod"
              @click="updateNetworkBond(network)"
            />
          </template>

          <template v-else>
            <MyStakingItem
              v-for="{ network, icon, fiatValue, amount, asset, unstakingAmount, unbondPeriod } in myStakingItems"
              :key="network"
              :network="network"
              :icon="icon"
              :fiatValue="fiatValue"
              :amount="amount"
              :asset="asset"
              :unstakingAmount="unstakingAmount"
              :unbondPeriod="unbondPeriod"
            />
          </template>
        </Scroll>
      </div>
    </ContentForm>

    <Bond v-if="showBond" :network="network" @closeBond="updateNetworkBond" />
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import type { StakingTab } from '@/interfaces/common';
import type { TokenBalance } from '@extension-base/background/types/types';
import { CONTENT_FORM_HEIGHT } from '@/consts/global';
import { getShimmersVisibility } from '@/helpers/shimmers';
import WalletBalance from '@/screens/main/WalletBalance.vue';
import SelectNetworkButton from '@/screens/wallet&asset/SelectNetworkButton.vue';
import StakingSettings from '@/screens/staking/StakingSettings.vue';
import StakingItem from '@/screens/staking/StakingItem.vue';
import MyStakingItem from '@/screens/staking/MyStakingItem.vue';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { NetworkName } from '@/interfaces';
import Bond from '@/screens/staking/Bond.vue';
import { getBondingDuration } from '@/extension/messaging';

@Component({
  components: {
    Bond,
    StakingItem,
    MyStakingItem,
    WalletBalance,
    StakingSettings,
    SelectNetworkButton,
  },
})
export default class Staking extends Vue {
  readonly selectNetworkButtonRef = 'selectNetworkButton';
  showNetworkManagement = false;
  activeTabName: StakingTab = 'all';
  filterValue = '';
  network = '';

  stakingItems = [
    {
      network: 'Sora mainnet',
      type: 'regular',
      icon: 'https://raw.githubusercontent.com/soramitsu/shared-features-utils/master/icons/chains/white/SORA.svg',
      unbondPeriod: 0,
    },
  ];

  myStakingItems = [
    {
      network: 'Sora mainnet',
      icon: 'https://raw.githubusercontent.com/soramitsu/shared-features-utils/master/icons/chains/white/SORA.svg',
      fiatValue: '400',
      asset: 'xor',
      amount: '5',
      unstakingAmount: '1.1',
      unbondPeriod: 0,
    },
  ];

  @Getter(AccountsGettersTypes.getBalances) balances!: TokenBalance[];

  get showBond() {
    return this.network !== '';
  }

  get showShimmers() {
    return getShimmersVisibility();
  }

  get contentFormHeight() {
    return CONTENT_FORM_HEIGHT;
  }

  get stakingBalance() {
    return 0;
  }

  get isAllTab() {
    return this.activeTabName === 'all';
  }

  async mounted() {
    const networks = this.stakingItems.map(({ network }) => network);
    const bondingDurations = await getBondingDuration(networks);

    bondingDurations.forEach(({ network, value }, index) => {
      this.stakingItems[index].unbondPeriod = value;

      const idx = this.myStakingItems.findIndex(
        ({ network: _network }) => _network.toLowerCase() == network.toLowerCase()
      );

      this.myStakingItems[idx].unbondPeriod = value;
    });
  }

  updateFilterValue(value: string) {
    this.filterValue = value;
  }

  updateActiveTabName(name: StakingTab) {
    this.activeTabName = name;
  }

  updateNetworkBond(network: NetworkName = '') {
    this.network = network.toLowerCase();
  }
}
</script>

<style lang="scss" scoped>
.staking {
  .staking-header {
    min-height: 46px;
    display: flex;
    justify-content: space-between;
    margin-bottom: 10px;
  }

  .balance-container {
    display: flex;
    flex-flow: row;
    gap: 5px;

    .balance {
      font-size: 22px;
      line-height: 28px;
      max-width: 245px;
    }

    .balance-loading {
      height: 46px;
    }

    .staking-balance {
      display: flex;
      flex-direction: column;
      text-transform: uppercase;

      .label {
        color: $gray-color;
        font-weight: 500;
        margin-bottom: 7px;
      }
    }
  }

  .content {
    padding: $default-padding $default-padding 0;
    height: 100%;
    display: flex;
    flex-direction: column;
  }
}
</style>
