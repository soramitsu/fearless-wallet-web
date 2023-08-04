<template>
  <div class="staking-item" @click="openStakingInfo">
    <div class="description-part left-part">
      <ExternalLogo :name="icon" class="network-icon" />

      <div class="network-description">
        <div class="stake-name">{{ $t(`staking.${type}`) }}</div>

        <div class="network-name">{{ network }}</div>
      </div>
    </div>

    <div class="description-part right-part">
      <div class="values">
        <div class="unstaking">{{ $t('staking.unstakingDays', days) }}</div>

        <div class="apy">{{ apy }} APY</div>
      </div>

      <Icon icon="chevron-right" class="chevron" />
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import type { CustomEvent } from '@/interfaces';
import type { NetworkJson } from '@extension-base/types';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';

@Component
export default class StakingItem extends Vue {
  @Prop(String) network!: string;
  @Prop(String) type!: 'Regular';
  @Prop(String) icon!: string;
  @Getter(NetworksGettersTypes.networks) networks!: NetworkJson[];

  get apy() {
    const value1 = 17;
    const value2 = 19;

    return `${value1}%-${value2}%`;
  }

  get days() {
    return { value: 28 };
  }

  openStakingInfo(event: CustomEvent) {
    // this.$router.push({
    //   name: Components.Asset,
    //   params: {
    //      assetId: this.assetData.assetId,
    //      network: this.redirectNetwork,
    //   },
    // });
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
        font-size: 12px;
        font-weight: 700;
      }

      .network-name {
        font-size: 20px;
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
      font-size: 12px;
      font-weight: 400;
      text-align: right;
      color: $default-white;
    }

    .apy {
      font-size: 20px;
      font-weight: 700;
      line-height: 25px;
      text-align: right;
      color: $pink-lavender-color;
    }

    .values {
      display: flex;
      flex-direction: column;
    }
  }

  .description-part {
    display: flex;
    align-items: center;
  }
}
</style>
