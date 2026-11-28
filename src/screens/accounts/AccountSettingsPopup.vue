<template>
  <Popup
    sizeWidth="mini"
    verticalPlacement="top"
    horizontalPlacement="right"
    :top="top"
    :left="-17"
    :showBorder="true"
    :showHeader="false"
    :zIndex="399"
    @handlerClose="$emit('handlerClose')"
  >
    <div class="account-settings">
      <div v-if="showExport && !isOfflineNexus" class="row" @click="$emit('openExportAccountPage')">
        <Icon icon="export" className="icon" />

        <div class="label" data-testid="exportAccount">{{ $t('accounts.exportAccount') }}</div>
      </div>

      <div v-if="showNodeSwitch && !isOfflineNexus" class="row" @click="openNetwork">
        <Icon icon="currency-switch" className="icon" />

        <div class="label" data-testid="switchNode">{{ $t('accounts.switchNode') }}</div>
      </div>

      <div v-if="showCopyAddress" class="row" @click="copyAddress">
        <Icon icon="copy-2" className="icon" />

        <div class="label" data-testid="copyAddress">{{ $t('accounts.copyAddress') }}</div>
      </div>

      <div v-if="!isOfflineNexus && haveExplorers" class="row" @click="openExplorer">
        <Icon icon="globus" className="icon" />

        <div class="label" data-testid="viewIn">{{ buttonText }}</div>
      </div>
    </div>
  </Popup>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import BaseApi from '@/util/BaseApi';
import { Components } from '@/router/routes';
import { setClipboard } from '@/helpers';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';
import { UNIVERSAL_WALLET_IROHA_NETWORKS } from '@/consts/universalWallet';

export default defineComponent({ name: 'AccountSettingsPopup' ,
  props: {
    selectedNetwork: String,
    showNodeSwitch: Boolean,
    showCopyAddress: Boolean,
    showExport: Boolean,
    buttonTopClick: Number,
  },
  data() {
    return {
      networksStore: useNetworksStore(),
      accountsStore: useAccountsStore(),
    };
  },
  computed: {
    isOfflineNexus() {
      const nexus = UNIVERSAL_WALLET_IROHA_NETWORKS.nexus;
      const chainId = this.networkProps?.chainId;

      return !nexus.enabledByDefault && (chainId === nexus.chainId || chainId === nexus.id);
    },
    networkProps() {
      return this.networksStore.getNetwork(this.selectedNetwork);
    },
    explorer() {
      return this.networkProps?.externalApi?.explorers?.[0];
    },
    haveExplorers() {
      return this.explorerUrl !== '';
    },
    // The account page from the registry's explorer template, as the history details build a transaction's page.
    explorerUrl(): string {
      const explorer = this.explorer;

      if (!explorer?.url || !this.addressByNetwork) return '';
      // Tonviewer shows an account at its own path, without a type segment.
      if (explorer.types?.includes('tonAccount')) return explorer.url.replace('{type}/', '').replace('{value}', this.addressByNetwork);

      const type = explorer.types?.find((name) => name === 'account' || name === 'address');

      return type ? explorer.url.replace('{type}', type).replace('{value}', this.addressByNetwork) : '';
    },
    buttonText() {
      const explorer =
            this.explorer?.type === 'etherscan'
              ? 'accounts.etherscan'
              : this.explorer?.type === 'tonviewer'
              ? 'accounts.tonviewer'
              : this.explorer?.type === 'subscan'
              ? 'accounts.subscan'
              : 'ux.openExplorer';

          return this.$t(explorer);
    },
    top() {
      if (this.buttonTopClick === undefined) return 110;

          if (this.buttonTopClick > 300) return this.buttonTopClick - 181;

          return this.buttonTopClick + 7;
    },
    addressByNetwork() {
      return BaseApi.formatAddress(this.accountsStore.selectedWallet, this.selectedNetwork);
    },
  },
  methods: {
    copyAddress() {
      setClipboard(this.addressByNetwork);

          this.close();
    },
    openExplorer() {
      window.open(this.explorerUrl);

          this.close();
    },
    openNetwork() {
      this.$router.push({
            name: Components.Nodes,
            params: {
              network: this.selectedNetwork,
            },
          });

          this.close();
    },
    close() {
      this.$emit('handlerClose');
    },
  },
});
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
