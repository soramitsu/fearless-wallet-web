<template>
  <AboveForm header="assets.networkIssues" class="network-management" :fullScreen="true" :closeHandler="closeForm">
    <div class="management-content">
      <Scroll>
        <Corners v-for="{ name, icon } in networks" :key="name" size="big" class="network-corners">
          <div class="network-item">
            <ExternalLogo class="network-img" :name="icon" />

            <div class="description">
              <div class="name">{{ name }}</div>

              <div class="unavailable">Network is unavailable</div>
            </div>

            <Button
              size="mini"
              class="switch-button"
              text="common.resolve"
              @click="$emit('setNetworkUnavailable', name)"
            />
          </div>
        </Corners>
      </Scroll>
    </div>
  </AboveForm>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import type { NetworkJson } from '@extension-base/types';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { SelectedWallet } from '@/store';

@Component
export default class NetworkManagement extends Vue {
  @Prop(Array) networks!: NetworkJson[];
  @Prop(Function) closeForm!: VoidFunction;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
}
</script>

<style lang="scss" scoped>
.network-management {
  z-index: 400 !important;

  .management-content {
    margin-right: -16px;
    height: 100%;

    .network-corners {
      margin-right: 16px;

      .network-item {
        display: flex;
        justify-content: space-between;
        padding: 16px 0 16px 16px;
        border-bottom: 1px solid $default-background-color;
        align-items: center;
        height: 68px;
        margin-bottom: 10px;
        clip-path: $big-clip-path-left-top-and-right-bottom;
        background-color: $secondary-background-color;
        border: 1px solid $default-background-color;
        border-radius: $default-border-radius;

        .network-img {
          width: 32px;
          margin-right: 16px;
          opacity: 0.65;
        }

        .switch-button {
          margin-right: 16px;
        }

        .description {
          display: flex;
          flex-direction: column;
          text-align: left;
          flex: 1 0 100px;

          .name {
            color: $default-white;
            text-transform: uppercase;
            line-height: 20px;
          }

          .unavailable {
            color: $gray-color;
            font-size: 12px;
            line-height: 18px;
          }
        }
      }
    }
  }
}
</style>
