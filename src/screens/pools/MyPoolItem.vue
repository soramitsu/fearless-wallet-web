<template>
  <ContentForm :height="250" :isStaticHeight="true" :bottomRightCorner="true">
    <div class="my-pools-item" @click="openPoolsInfo">
      <div class="header">
        <div class="description-part left-part">
          <ExternalLogo :name="icon1" class="network-icon" />

          <ExternalLogo :name="icon2" class="network-icon" />

          <div class="network-name">{{ network }}</div>
        </div>
      </div>

      <div class="row">
        <div>{{ 'test' }}</div>

        <Loading v-if="isLoading" :width="28" />

        <div v-else class="value">{{ apr }}</div>
      </div>
    </div>
  </ContentForm>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { type TokenGroup } from '@extension-base/background/types/types';
import type { NetworkJson } from '@extension-base/types';
import type { GetAssetPrice, PoolsParams } from '@/store';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { Components } from '@/router/routes';

@Component
export default class MyPoolItem extends Vue {
  @Prop(Object) poolParams!: PoolsParams;
  @Getter(AccountsGettersTypes.fiatSymbol) fiatSymbol!: string;
  @Getter(AccountsGettersTypes.getBalances) balances!: TokenGroup[];
  @Getter(NetworksGettersTypes.getAssetPrice) getAssetPrice!: GetAssetPrice;
  @Getter(NetworksGettersTypes.networks) networks!: NetworkJson[];

  get network() {
    return this.poolParams.network;
  }

  get icon1() {
    return this.poolParams.asset1.icon;
  }

  get icon2() {
    return this.poolParams.asset2.icon;
  }

  get asset1() {
    return this.poolParams.asset1.name;
  }

  get asset2() {
    return this.poolParams.asset2.name;
  }

  get isLoading() {
    return this.poolParams.loading;
  }

  get apr() {
    return `${this.$n(this.poolParams.apr, 'price')}%`;
  }

  openPoolsInfo() {
    if (!this.isLoading)
      this.$router.push({
        name: Components.MyStake,
        params: {
          network: this.network.toLowerCase(),
          paramsLoaded: 'true',
        },
      });
  }
}
</script>

<style lang="scss" scoped>
.my-pools-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 20px 0 0 15px;
  margin-right: 16px;
  user-select: none;
  cursor: pointer;

  .row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: $default-border;
    font-size: 14px;
    text-align: left;
    padding: 5px 0;
    min-height: 45px;
    width: 100%;
    color: $default-white;

    &:last-child {
      border-bottom: none;
    }

    .value {
      font-weight: 600;
      text-align: right;
      text-transform: uppercase;
      display: flex;
      flex-direction: row;
      align-items: center;
    }
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 15px;
    width: 100%;

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
        text-align: left;
      }
    }

    .description-part {
      display: flex;
      align-items: center;
    }
  }
}
</style>
