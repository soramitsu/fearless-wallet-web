<template>
  <AboveForm header="asset.networkIssues" class="network-management" :blur="true" :closeHandler="closeForm">
    <div class="management-content">
      <Scroll>
        <Corners v-for="{ name } in disconnectedNetworks" :key="name" size="big" class="network-corners">
          <div class="network-item">
            <NetworkLogo class="network-img" :name="name" :width="32" />

            <div class="description">
              <div class="name">{{ name }}</div>

              <div class="unavailable">Network is unavailable</div>
            </div>

            <Button
              v-if="getSwitchNodeButtonVisible(name)"
              size="mini"
              class="switch-button"
              text="accounts.switchNode"
              @click="openSwitchNode(name)"
            />

            <Icon
              v-else
              icon="info-triangle"
              className="warning-img"
              @click.native="$emit('setNetworkUnavailable', name)"
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
import type { Networks } from '@/interfaces';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { SelectedWallet } from '@/store';
import { Components } from '@/router/routes';

@Component
export default class ReceiveForm extends Vue {
  @Prop(Array) disconnectedNetworks!: Networks;
  @Prop(Function) closeForm!: VoidFunction;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;

  getSwitchNodeButtonVisible(network: string) {
    return this.disconnectedNetworks.find(({ name }) => name === network)!.nodes.length > 1;
  }

  openSwitchNode(network: string) {
    this.$router.push({
      name: Components.Nodes,
      params: { network },
    });
  }
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

        .warning-img {
          width: 28px;
          height: 28px;
          opacity: 0.9;
          margin-right: 16px;

          &:hover {
            cursor: pointer;
            opacity: 1;
          }
        }
      }
    }
  }
}
</style>
