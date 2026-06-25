<template>
  <div class="header-pool">
    <DoubleAssetHighlightIcon
      :icon1="icon1"
      :icon2="icon2"
      :shadowColor1="color1"
      :shadowColor2="color2"
      :size="size"
    />

    <div v-if="step !== 3" class="pool-descriptions">
      <div class="pool-name" data-testid="poolName">
        {{ poolName }}

        <Icon icon="pool" class="pool-icon" :hover="false" />
      </div>

      <div class="tvl" data-testid="tvl">{{ tvl }} TVL</div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';


import { useAccountsStore } from '@/stores/accounts';

export default defineComponent({ name: 'PoolHeader',
  components: {},
  props: {
    poolParams: { type: Object },
    step: { type: Number },
  },
  data() {
    return {
      accountsStore: useAccountsStore(),
    };
  },
  computed: {
    size() {
      return this.step === 3 ? 'big' : 'small';
    },
    tvl() {
      const tvl = +(this.poolParams?.tvl ?? 0);

          return `${this.accountsStore.fiatSymbol}${this.$n(tvl, 'price')}`;
    },
    icon1() {
      return this.poolParams?.asset1.icon ?? '';
    },
    icon2() {
      return this.poolParams?.asset2.icon ?? '';
    },
    color1() {
      return this.poolParams?.asset1.color ?? '';
    },
    color2() {
      return this.poolParams?.asset2.color ?? '';
    },
    poolName() {
      const asset1 = this.poolParams?.asset1.name.toUpperCase();
          const asset2 = this.poolParams?.asset2.name.toUpperCase();

          return `${asset1}-${asset2} ${this.$t('pools.pool')}`;
    },
  },
});
</script>

<style lang="scss" scoped>
.header-pool {
  display: flex;
  padding: 25px 20px;
  justify-content: center;

  .pool-descriptions {
    display: flex;
    flex-direction: column;
    text-align: left;
    margin-left: 10px;
    flex: 1;
    color: $default-white;

    .pool-name {
      display: flex;
      align-items: center;
      font-weight: 700;
      font-size: 1.5em;
      line-height: 35px;
    }

    .pool-icon {
      margin-left: 5px;
      width: 24px;
      height: 24px;
    }

    .tvl {
      color: $gray-color;
      font-size: 0.875em;
    }
  }
}
</style>
