<template>
  <div class="pool-item" @click="click">
    <div class="description-part left-part">
      <ExternalLogo :name="icon" class="network-icon" />

      <div class="network-name">{{ network }}</div>
    </div>

    <div class="description-part right-part">
      <div class="values">
        <Shimmer v-if="isLoading" height="20px" width="155px" />

        <div v-else class="apy">{{ apy }} APY</div>

        <Shimmer v-if="isLoading" height="12px" width="55px" />

        <div v-else class="min-bond">{{ $t('common.min') }} {{ minBond }} {{ asset }}</div>
      </div>

      <Icon icon="chevron-right" class="chevron" />
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { APIItemState } from '@extension-base/api/types/networks';
import { type TokenGroup } from '@extension-base/background/types/types';
import type { NetworkJson } from '@extension-base/types';
import type { NetworkParams } from '@/store';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { isSameString } from '@/helpers';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';

@Component
export default class PoolItem extends Vue {
  @Prop(Object) networkParams!: NetworkParams;
  @Getter(NetworksGettersTypes.networks) networks!: NetworkJson[];
  @Getter(AccountsGettersTypes.getBalances) balances!: TokenGroup[];

  get network() {
    return this.networkParams.network;
  }

  get assetId() {
    return this.networkParams.assetId;
  }

  get poolCurrency() {
    return this.balances?.find(({ groupId }) => groupId === this.assetId);
  }

  get isLoading() {
    return !this.balanceIsReady;
  }

  get balanceIsReady() {
    const networkBalance = this.poolCurrency?.balances?.find(({ name }) => isSameString(name, this.network));

    return networkBalance?.state === APIItemState.READY;
  }

  get apy() {
    return `${this.$n(this.networkParams.apy, 'price')}%`;
  }

  get asset() {
    return this.networkParams.asset.toUpperCase();
  }

  get icon() {
    return this.networkParams.icon;
  }

  get unbondPeriod() {
    return this.networkParams.unbondPeriod;
  }

  get minBond() {
    return this.networkParams.minBond;
  }

  get type() {
    return this.networkParams.type;
  }

  get days() {
    return { value: this.networkParams.unbondPeriod };
  }

  click() {
    if (!this.isLoading) this.$emit('click');
  }
}
</script>

<style lang="scss" scoped>
.pool-item {
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

    .network-name {
      font-size: 20px;
      font-weight: 700;
      line-height: 25px;
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

    .apy {
      font-size: 20px;
      font-weight: 700;
      line-height: 25px;
      color: $pink-lavender-color;
    }

    .min-bond {
      font-size: 12px;
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
