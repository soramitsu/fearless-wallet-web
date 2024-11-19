<template>
  <div class="staking-item" data-testid="stakingItem" @click="click">
    <div class="description-part left-part">
      <ExternalLogo :name="icon" class="network-icon" />

      <div class="network-description">
        <div class="stake-name" data-testid="stakeName">{{ $t(`staking.${type}`) }}</div>

        <div class="network-name" data-testid="networkName">{{ network }}</div>
      </div>
    </div>

    <div class="description-part right-part">
      <div class="values">
        <Shimmer v-if="isLoading" height="12px" width="135px" />

        <div v-else class="unstaking" data-testid="unstaking">{{ $t('staking.unstakingDays', days) }}</div>

        <Shimmer v-if="isLoading" height="20px" width="155px" />

        <div v-else class="apy" data-testid="apy">{{ apy }} APY</div>

        <Shimmer v-if="isLoading" height="12px" width="55px" />

        <div v-else class="min-bond" data-testid="minBond">{{ $t('common.min') }} {{ minBond }} {{ asset }}</div>
      </div>

      <Icon icon="chevron-right" class="chevron" data-testid="chevronRight" />
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { APIItemState } from '@extension-base/api/types/networks';
import type { NetworkParams } from '@/stores';
import { isSameString } from '@/helpers';
import { useAccountsStore } from '@/stores/accounts';

@Component
export default class StakingItem extends Vue {
  accountsStore = useAccountsStore();

  @Prop(Object) stakingNetwork!: NetworkParams;

  get network() {
    return this.stakingNetwork.network;
  }

  get assetId() {
    return this.stakingNetwork.assetId;
  }

  get stakingCurrency() {
    return this.accountsStore.balances?.find(({ groupId }) => groupId === this.assetId);
  }

  get isLoading() {
    return !this.balanceIsReady;
  }

  get balanceIsReady() {
    const networkBalance = this.stakingCurrency?.balances?.find(({ name }) => isSameString(name, this.network));

    return networkBalance?.state === APIItemState.READY;
  }

  get apy() {
    return `${this.$n(this.stakingNetwork.apy, 'price')}%`;
  }

  get asset() {
    return this.stakingNetwork.asset.toUpperCase();
  }

  get icon() {
    return this.stakingNetwork.icon;
  }

  get unbondPeriod() {
    return this.stakingNetwork.unbondPeriod;
  }

  get minBond() {
    return this.stakingNetwork.minBond;
  }

  get type() {
    return this.stakingNetwork.type;
  }

  get days() {
    return { value: this.stakingNetwork.unbondPeriod };
  }

  click() {
    if (!this.isLoading) this.$emit('click');
  }
}
</script>

<style lang="scss" scoped>
.staking-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: $default-border;
  height: 80px;
  padding: 8px 0 8px 14px;
  margin-right: 16px;
  user-select: none;
  cursor: pointer;

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
      text-align: left;

      .stake-name {
        font-size: 0.75em;
        font-weight: 700;
        color: $default-white;
      }

      .network-name {
        font-size: 1.25em;
        font-weight: 700;
        line-height: 25px;
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

    .unstaking {
      font-size: 0.75em;
      font-weight: 400;
      color: $default-white;
    }

    .apy {
      font-size: 1.25em;
      font-weight: 700;
      line-height: 25px;
      color: $pink-lavender-color;
    }

    .min-bond {
      font-size: 0.75em;
      color: $default-white;
    }

    .values {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      justify-content: space-between;
      height: 55px;
    }
  }

  .description-part {
    display: flex;
    align-items: center;
  }
}
</style>
