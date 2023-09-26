<template>
  <Popup
    sizeWidth="mini"
    verticalPlacement="top"
    horizontalPlacement="right"
    :top="top"
    :left="-17"
    :showBorder="true"
    :showHeader="false"
    @handlerClose="$emit('handlerClose')"
  >
    <div class="account-settings">
      <div v-if="showExport" class="row" @click="openNotificationPopup">
        <Icon icon="export" className="icon" />

        <div class="label">{{ $t('accounts.export') }}</div>
      </div>

      <div v-if="showNodeSwitch" class="row" @click="openNetwork">
        <Icon icon="currency-switch" className="icon" />

        <div class="label">{{ $t('accounts.switchNode') }}</div>
      </div>

      <div v-if="showCopyAddress" class="row" @click="copyAddress">
        <Icon icon="copy-2" className="icon" />

        <div class="label">{{ $t('accounts.copyAddress') }}</div>
      </div>

      <div class="row" @click="openExplorer">
        <Icon icon="globus" className="icon" />

        <div class="label">{{ buttonText }}</div>
      </div>
    </div>
  </Popup>
</template>

<script lang="ts">
import { Getter } from 'vuex-class';
import { Component, Vue, Prop } from 'vue-property-decorator';
import type { GetNetwork, SelectedWallet } from '@/store';
import BaseApi from '@/util/BaseApi';
import { Components } from '@/router/routes';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { EXPLORERS_BASE_URLS } from '@/consts/networks';
@Component
export default class AccountSettingsPopup extends Vue {
  @Prop(String) selectedNetwork!: string;
  @Prop(Boolean) showNodeSwitch!: boolean;
  @Prop(Boolean) showCopyAddress!: boolean;
  @Prop(Boolean) showExport!: boolean;
  @Prop(Number) buttonTopClick!: number;

  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Getter(NetworksGettersTypes.getNetwork) getNetwork!: GetNetwork;

  get explorerType() {
    return this.getNetwork(this.selectedNetwork)?.externalApi?.history?.type;
  }

  get explorerUrl() {
    const network = this.getNetwork(this.selectedNetwork);

    if (network.externalApi?.explorers) return network?.externalApi?.explorers[0].url;

    return '';
  }

  get buttonText() {
    return this.$t(this.explorerType === 'etherscan' ? 'accounts.etherscan' : 'accounts.subscan');
  }

  get top() {
    if (this.buttonTopClick === undefined) return 110;

    if (this.buttonTopClick > 300) return this.buttonTopClick - 181;

    return this.buttonTopClick + 7;
  }

  get addressByNetwork() {
    return BaseApi.formatAddress(this.selectedWallet, this.selectedNetwork);
  }

  copyAddress() {
    navigator.clipboard.writeText(this.addressByNetwork);

    this.close();
  }

  get lowerCaseSelectedNetwork() {
    return this.selectedNetwork.toLowerCase();
  }

  get substrateExplorerByNetwork() {
    return EXPLORERS_BASE_URLS[this.lowerCaseSelectedNetwork] ?? this.selectedNetwork;
  }

  openEvmExplorer() {
    const hostname = new URL(this.explorerUrl).hostname;

    window.open(`https://${hostname}/address/${this.addressByNetwork}`);
  }

  openSubscan() {
    window.open(`https://${this.substrateExplorerByNetwork}.subscan.io/account/${this.addressByNetwork}`);
  }

  openExplorer() {
    if (this.explorerType === 'etherscan') return this.openEvmExplorer();
    else this.openSubscan();

    this.close();
  }

  openNetwork() {
    this.$router.push({
      name: Components.Nodes,
      params: {
        network: this.selectedNetwork,
      },
    });

    this.close();
  }

  openNotificationPopup() {
    this.$emit('openNotificationPopup', 'export');
  }

  close() {
    this.$emit('handlerClose');
  }
}
</script>

<style lang="scss" scoped>
.account-settings {
  color: $default-white;
  font-weight: 500;
  height: fit-content;

  .row {
    display: flex;
    margin: 0 0 20px 20px;

    &:last-child {
      margin-bottom: 0;
    }

    &:hover {
      cursor: pointer;
      color: rgba(255, 255, 255, 0.9);

      .icon {
        filter: invert(0.1);
      }
    }

    .icon {
      width: 20px;
      height: 20px;
      filter: invert(0.25);
    }

    .label {
      margin: auto 0 auto 10px;
      width: 160px;
      text-align: left;
    }
  }
}
</style>
