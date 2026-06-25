<template>
  <div class="pool-item" data-testid="poolItem" @click="click">
    <div class="icons" data-testid="poolIcons">
      <ExternalLogo :name="icon1" class="network-icon-1" />

      <ExternalLogo :name="icon2" class="network-icon-2" />
    </div>

    <div class="description-part">
      <diV class="descriptions">
        <div class="pool-name" data-testid="poolName">{{ poolName }}</div>

        <Shimmer v-if="isLoading" height="20px" width="155px" />

        <div v-else class="tvl" data-testid="poolTvl">{{ tvl }} TVL</div>
      </diV>

      <div class="values" data-testid="values">
        <div class="earn">
          Earn
          <p class="asset" data-testid="earnAsset">{{ asset2 }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import { APIItemState } from '@extension-base/api/types/networks';
import { isSameString } from '@/helpers';
import { useAccountsStore } from '@/stores/accounts';

export default defineComponent({ name: 'PoolItem' ,
  props: {
    poolParams: Object,
  },
  data() {
    return {
      accountsStore: useAccountsStore(),
    };
  },
  computed: {
    network() {
      return this.poolParams.network;
    },
    tvl() {
      return `${this.accountsStore.fiatSymbol}${this.$n(+this.poolParams.tvl, 'price')}`;
    },
    assetId1() {
      return this.poolParams.asset1.id;
    },
    assetId2() {
      return this.poolParams.asset2.id;
    },
    asset1() {
      return this.poolCurrency1?.symbol;
    },
    asset2() {
      return this.poolCurrency2?.symbol;
    },
    poolName() {
      return `${this.asset1}-${this.asset2}`;
    },
    poolCurrency1() {
      return this.accountsStore.balances?.find(({ groupId }) => groupId === this.assetId1);
    },
    poolCurrency2() {
      return this.accountsStore.balances?.find(({ groupId }) => groupId === this.assetId2);
    },
    isLoading() {
      return !this.balanceIsReady;
    },
    balanceIsReady() {
      const networkBalance1 = this.poolCurrency1?.balances?.find(({ name }) => isSameString(name, this.network));
          const networkBalance2 = this.poolCurrency1?.balances?.find(({ name }) => isSameString(name, this.network));

          return networkBalance1?.state === APIItemState.READY && networkBalance2?.state === APIItemState.READY;
    },
    icon1() {
      return this.poolParams.asset1.icon;
    },
    icon2() {
      return this.poolParams.asset2.icon;
    },
  },
  methods: {
    click() {
      if (!this.isLoading) this.$emit('click');
    },
  },
});
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
        font-size: 0.75rem;
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
