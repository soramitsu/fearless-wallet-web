<template>
  <Lazy class="currency-item">
    <div class="img-container">
      <!-- <img :src="icon" :alt="assetName" /> -->
    </div>

    <div class="descriptions-column">
      <div class="row first-row">
        <div>
          <!-- {{ upperNetworkName }} -->
        </div>

        <template>
          <!-- <Shimmer v-if="showShimmers" height="14px" width="60px" /> -->

          <!-- <template v-else-if="!showWarning">
            <div class="available-networks">
              <NetworkLogo
                v-for="{ network } in availableInNetworksPart"
                class="minor-network-img"
                :key="network"
                :name="network"
                :width="12"
              />

              <div v-if="isAdditional" class="additional">+{{ additionalCount }}</div>
            </div>
          </template> -->
        </template>
      </div>
      <div class="row second-row">
        <div class="currency-name overflow">{{ assetName }}</div>

        <!-- <Shimmer v-if="showShimmers" height="23px" width="60px" /> -->

        <!-- <div v-else-if="!showWarning" class="count-assets overflow">
          {{ countAssetsString }}
        </div> -->
      </div>
      <div class="row third-row">
        <div class="price row">
          {{ assetData.free }}

          <!-- <div :class="changePriceClasses">{{ usd24HoursChangeString }}</div> -->
        </div>

        <!-- <Shimmer v-if="showShimmers" height="14px" width="70px" /> -->

        <!-- <div v-else-if="!showWarning" class="total-balance overflow">
          {{ totalBalanceString }}
        </div> -->
      </div>
    </div>
    <div class="activity">
      <!-- <template v-if="showWarning">
        <Icon icon="info-triangle" className="warning-img" @click.native="$emit('toggleNetworkManagementVisible')" />

        <Tooltip text="common.networkDisconnected" target=".warning-img" placement="left" />
      </template> -->

      <template>
        <CircleButton
          iconName="send-white"
          backgroundColor="black"
          class="button send"
          tooltipText="asset.sendButtonText"
          target=".send"
        />

        <CircleButton
          iconName="receive-white"
          backgroundColor="black"
          class="button receive"
          tooltipText="asset.receiveButtonText"
          target=".receive"
        />

        <CircleButton
          iconName="chevron-right"
          backgroundColor="none"
          backgroundColorHover="black"
          class="details"
          tooltipText="wallet.assetDetails"
          target=".details"
        />
      </template>
    </div>
  </Lazy>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import type { Currency } from '@/interfaces/currencies';
import type { SelectedWallet } from '@/store';
import type { CustomEvent } from '@/interfaces';
import { Components } from '@/router/routes';
import { formattedNumber, formattedPrice } from '@/helpers/numbers';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { GetNetworkStatus } from '@/store';
interface AssetData {
  feeFrozen: string;
  free: string;
  miscFrozen: string;
  reserved: string;
  state: string;
  timestamp: number;
}

@Component
export default class CurrencyItemStateLess extends Vue {
  @Prop(Object) assetData!: AssetData;
  @Prop(String) assetName!: string;

  get icon() {
    return `https://github.com/soramitsu/fearless-utils/tree/master/icons/tokens/coloured/${this.assetName}`;
  }
}
</script>

<style lang="scss" scoped>
.currency-item {
  display: flex;
  padding: 8px 0 8px 14px;
  border-bottom: 1px solid $default-background-color;
  margin-right: 16px;
  align-items: center;
  height: 80px;

  &:hover {
    cursor: pointer;
  }

  &:last-child {
    border-bottom: none;
  }

  .drag-icon {
    margin: auto 20px auto 0;

    &:hover {
      cursor: pointer;
    }

    i {
      color: #fff;
    }
  }

  .descriptions-column {
    width: 100%;

    .row {
      display: flex;
      justify-content: space-between;
    }

    .first-row {
      font-size: 12px;
      color: $gray-color;
      margin-bottom: 5px;
      height: 14px;

      .available-networks {
        display: flex;
      }

      .additional {
        border-radius: 50%;

        &:hover {
          cursor: pointer;
        }
      }
    }

    .second-row {
      font-weight: 700;
      margin-bottom: 5px;

      .currency-name {
        font-size: 20px;
        text-transform: uppercase;
        max-width: 220px;
      }

      .count-assets {
        max-width: 200px;
        font-size: 18px;
        margin: auto 0;
      }
    }

    .third-row {
      display: flex;
      font-size: 12px;
      color: $default-white;
      height: 14px;

      .price {
        max-width: 100px;
      }

      .price-change {
        margin-left: 2px;
      }

      .up-price {
        color: rgba(126, 222, 155, 0.75);
      }

      .down-price {
        color: #d0021b;
      }

      .total-balance {
        max-width: 200px;
      }
    }
  }

  .overflow {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .second-row-left {
    font-size: 20px;
  }

  .activity {
    display: flex;
    align-items: center;
    margin-left: 16px;
  }

  .button {
    margin-right: 7px;
  }

  .warning-img {
    width: 28px;
    height: 28px;
    opacity: 0.9;

    &:hover {
      opacity: 1;
    }
  }

  .img-container {
    margin: auto;
    user-select: none;

    .main-network-img {
      margin-right: 13px;
    }
  }

  .minor-network-img {
    margin-right: 3px;
    opacity: 0.5;
    user-select: none;

    &:last-child {
      margin-right: 0;
    }
  }
}
</style>
