<template>
  <div class="pool-item" @click="click">
    <div class="icons">
      <ExternalLogo :name="icon1" class="network-icon-1" />

      <ExternalLogo :name="icon2" class="network-icon-2" />
    </div>

    <div class="description-part">
      <diV class="descriptions">
        <div class="pool-name">{{ poolName }}</div>

        <Shimmer v-if="isLoading" height="20px" width="155px" />

        <div v-else class="tvl">{{ tvl }} TVL</div>
      </diV>

      <div class="values">
        <div class="earn">
          Earn
          <p class="asset">{{ asset2 }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { APIItemState } from '@extension-base/api/types/networks';
import { type TokenGroup } from '@extension-base/background/types/types';
import type { PoolParams } from '@/store';
import { isSameString } from '@/helpers';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';

@Component
export default class PoolItem extends Vue {
  @Prop(Object) poolParams!: PoolParams;
  @Getter(AccountsGettersTypes.getBalances) balances!: TokenGroup[];
  @Getter(AccountsGettersTypes.fiatSymbol) fiatSymbol!: string;

  get network() {
    return this.poolParams.network;
  }

  get tvl() {
    return `${this.fiatSymbol}${this.$n(+this.poolParams.tvl, 'price')}`;
  }

  get assetId1() {
    return this.poolParams.asset1.id;
  }

  get assetId2() {
    return this.poolParams.asset2.id;
  }

  get asset1() {
    return this.poolCurrency1?.symbol;
  }

  get asset2() {
    return this.poolCurrency2?.symbol;
  }

  get poolName() {
    return `${this.asset1}-${this.asset2}`;
  }

  get poolCurrency1() {
    return this.balances?.find(({ groupId }) => groupId === this.assetId1);
  }

  get poolCurrency2() {
    return this.balances?.find(({ groupId }) => groupId === this.assetId2);
  }

  get isLoading() {
    return !this.balanceIsReady;
  }

  get balanceIsReady() {
    const networkBalance1 = this.poolCurrency1?.balances?.find(({ name }) => isSameString(name, this.network));
    const networkBalance2 = this.poolCurrency1?.balances?.find(({ name }) => isSameString(name, this.network));

    return networkBalance1?.state === APIItemState.READY && networkBalance2?.state === APIItemState.READY;
  }

  get icon1() {
    return this.poolParams.asset1.icon;
  }

  get icon2() {
    return this.poolParams.asset2.icon;
  }

  click() {
    if (!this.isLoading) this.$emit('click');
  }
}
</script>

<style lang="scss" scoped>
.pool-item {
  display: flex;
  align-items: center;
  border-bottom: $default-border;
  height: 80px;
  user-select: none;
  cursor: pointer;

  .icons {
    display: flex;
    align-items: center;

    .network-icon-1 {
      margin-top: -5px;
    }

    .network-icon-2 {
      margin-top: 10px;
      margin-left: -17px;
    }
  }

  .description-part {
    display: flex;
    flex-direction: column;
    flex: 1;
    margin-left: 10px;

    .descriptions {
      display: flex;
      justify-content: space-between;

      .pool-name {
        text-transform: uppercase;
        color: $default-white;
      }
    }

    .values {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;

      .earn {
        display: flex;
        font-size: 12px;
        color: $grayish-white-2;

        .asset {
          text-transform: uppercase;
          margin-left: 5px;
        }
      }
    }

    .chevron {
      width: 30px;
      height: 30px;
      margin-left: 8px;
      color: $grayish-white-2;
    }

    .tvl {
      font-weight: 600;
      color: $pink-lavender-color;
    }
  }
}
</style>
