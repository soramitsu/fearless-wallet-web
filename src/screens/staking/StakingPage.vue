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
              v-for="item in stakingItems"
              :key="item.network"
              :network="item.network"
              :type="item.type"
              :icon="item.icon"
              :unbondPeriod="item.unbondPeriod"
              @click="updateNetworkBond(item)"
            />
          </template>

          <template v-else>
            <MyStakingItem
              v-for="{ network, icon, unbondPeriod } in myStakingItems"
              :key="network"
              :network="network"
              :icon="icon"
              :fiatValue="getAmountPriceValue(network)"
              :amount="getStakingAmount(network)"
              :asset="getAssetName(network)"
              :unstakingAmount="getUnstakingAmount(network)"
              :unbondPeriod="unbondPeriod"
            />
          </template>
        </Scroll>
      </div>
    </ContentForm>

    <Bond v-if="showBond" :networkParams="networkParams" @closeBond="updateNetworkBond" />
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
import { NetworkName, NetworkParams } from '@/interfaces';
import Bond from '@/screens/staking/Bond.vue';
import { getStakingParams } from '@/extension/messaging';
import { SORA_NETWORK_NAME } from '@/consts/sora';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { GetAssetPrice } from '@/store';
import { getCostOfAssets } from '@/controllers/transferHelpers';
import { getUtilityAsset } from '@/helpers/currencies';

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
  networkParams: Nullable<NetworkParams> = null;

  stakingItems: NetworkParams[] = [
    {
      network: SORA_NETWORK_NAME,
      type: 'regular',
      icon: 'https://raw.githubusercontent.com/soramitsu/shared-features-utils/master/icons/chains/white/SORA.svg',
      unbondPeriod: 0,
      maxNominations: 0,
    },
  ];

  myStakingItems: NetworkParams[] = [
    {
      network: SORA_NETWORK_NAME,
      icon: 'https://raw.githubusercontent.com/soramitsu/shared-features-utils/master/icons/chains/white/SORA.svg',
      unbondPeriod: 0,
      maxNominations: 0,
    },
  ];

  @Getter(AccountsGettersTypes.getBalances) balances!: TokenBalance[];
  @Getter(NetworksGettersTypes.getAssetPrice) getAssetPrice!: GetAssetPrice;

  get showBond() {
    return this.networkParams !== null;
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
    const stakingParams = await getStakingParams(networks);

    stakingParams.forEach(({ network, unbondPeriod, maxNominations }, index) => {
      this.stakingItems[index].unbondPeriod = unbondPeriod;
      this.stakingItems[index].maxNominations = maxNominations;

      const idx = this.myStakingItems.findIndex(
        ({ network: _network }) => _network.toLowerCase() == network.toLowerCase()
      );

      this.myStakingItems[idx].unbondPeriod = unbondPeriod;
      this.myStakingItems[idx].maxNominations = maxNominations;
    });
  }

  updateFilterValue(value: string) {
    this.filterValue = value;
  }

  updateActiveTabName(name: StakingTab) {
    this.activeTabName = name;
  }

  updateNetworkBond(networkParams: Nullable<NetworkParams> = null) {
    this.networkParams = networkParams;
  }

  getUnstakingAmount(network: NetworkName) {
    network;

    return '0';
  }

  getStakingAmount(network: NetworkName) {
    network;

    return '5';
  }

  getAssetName(network: NetworkName) {
    return this.getUtilityAsset(network)?.symbol ?? '';
  }

  getUtilityAsset(network: NetworkName) {
    return getUtilityAsset(this.balances, network);
  }

  getAmountPriceValue(network: NetworkName) {
    const stakingCurrency = this.getUtilityAsset(network);
    const priceId = stakingCurrency?.priceId ?? '';
    const price = this.getAssetPrice(priceId).price;
    const amount = this.getStakingAmount(network);

    return getCostOfAssets(amount, price).toString();
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
