<template>
  <AboveForm :header="formHeader" :fullScreen="true" @closeHandler="closeForm">
    <div class="receive-form">
      <div>
        <InputWithIcon
          placeholder="assets.network"
          icon="rotate"
          data-testid="selectedNetwork"
          :value="networkName"
          :ref="selectNetworkInputRef"
          :isActiveRotate="showSelectNetworkPopup"
          @click="toggleSelectNetworkPopupVisible"
        />

        <div class="receive-content">
          <div class="address-wrapper">
            <div class="address-header">
              <span>{{ $t('assets.walletAddress') }}</span>

              <span v-if="networkName" class="network-chip" data-testid="receiveNetworkChip">
                {{ $t('assets.onNetwork', { network: networkName }) }}
              </span>
            </div>

            <div class="address" data-testid="cutAddress">
              <span class="full-address">{{ address }}</span>
              <button type="button" class="copy-icon" :aria-label="$t('common.copyToClipboard')" data-testid="copyAddress" @click="copyAddress">
                <Icon icon="copy" width="24px" height="24px" />
              </button>
            </div>
          </div>

          <QR class="qr" ref="qr" data-testid="qr" :showLogo="true" :width="200" :payload="address" />

          <Alert v-if="showNetworkWarning" class="network-warning" data-testid="receiveNetworkWarning">
            <span data-testid="receiveOnlyOnNetwork">
              {{ $t('assets.receiveOnlyOnNetwork', { symbol: receiveSymbol, network: networkName }) }}
            </span>
            <span v-if="isEvmNetwork" class="evm-note" data-testid="receiveEvmSameAddress">
              {{ $t('assets.receiveEvmSameAddress') }}
            </span>
          </Alert>
        </div>

        <Tooltip text="common.copied" target=".copy-icon" placement="bottom" trigger="click" />
      </div>

      <div class="activity-buttons">
        <BorderButton
          size="big"
          class="button"
          text="assets.saveQR"
          iconName="receive-white"
          data-testid="saveQR"
          :width="widthSaveBtn"
          @click="saveQR"
        />

        <FButton
          v-if="showCopyBtn"
          size="big"
          class="button copy-qr"
          text="assets.copyQR"
          iconName="share"
          data-testid="copyQR"
          width="260px"
          @click="copyQR"
        />

        <Tooltip :text="copyQRTooltip" target=".copy-qr" placement="bottom" trigger="click" />
      </div>
    </div>

    <SelectPopup
      v-if="showSelectNetworkPopup"
      class="select-network-popup"
      placeholder="common.searchNetwork"
      verticalPlacement="top"
      horizontalPlacement="left"
      :value="networkName"
      :showBlur="false"
      :showBackground="false"
      :top="148"
      :left="popupLeft"
      :height="360"
      :options="assetNetworks"
      @handlerFilter="handlerFilter"
      @toggleValue="toggleSelectedNetwork"
      @handlerClose="toggleSelectNetworkPopupVisible"
    />
  </AboveForm>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import { saveAs } from 'file-saver';
import { getNativeAssetName } from '@extension-base/background/handlers/utils';
import BaseApi from '@/util/BaseApi';
import { isSameString, setClipboard } from '@/helpers';
import { findTransferAssetGroup } from '@/helpers/currencies';
import { IS_EXTENSION } from '@/consts/global';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

export default defineComponent({ name: 'ReceiveForm' ,
  data() {
    return {
      selectNetworkInputRef: 'selectNetworkInput',
      copyQRTooltip: {
    text: 'common.copiedValue',
    localeProps: { value: 'QR' },
  },
      networksStore: useNetworksStore(),
      accountsStore: useAccountsStore(),
      filterValue: '',
      selectedNetwork: 'polkadot',
      showSelectNetworkPopup: false,
    };
  },
  computed: {
    selectedAssetId() {
      return this.$route.params.assetId ?? '';
    },
    popupLeft() {
      return IS_EXTENSION ? -160 : 0;
    },
    receiveBalance() {
      const currency = findTransferAssetGroup(this.accountsStore.balances, this.selectedAssetId, this.selectedNetwork);

      return currency?.balances.find(({ name }) => isSameString(name, this.selectedNetwork));
    },
    selectedNetworkJson() {
      return this.selectedNetwork ? this.networksStore.getNetwork(this.selectedNetwork) : undefined;
    },
    networkName() {
      return this.selectedNetworkJson?.name ?? this.selectedNetwork;
    },
    receiveSymbol() {
      // Without the asset on this network, name the network's utility token instead.
      const symbol = this.receiveBalance?.symbol ?? this.selectedNetworkJson?.assets?.[0]?.symbol ?? '';

      return getNativeAssetName(symbol).toUpperCase();
    },
    formHeader() {
      if (!this.receiveSymbol) return 'assets.receiveFunds';

      return { text: 'assets.receiveTokenTitle', localeProps: { symbol: this.receiveSymbol } };
    },
    showNetworkWarning() {
      return this.receiveSymbol !== '' && this.networkName !== '';
    },
    isEvmNetwork() {
      return BaseApi.isEthereumNetwork(this.selectedNetwork);
    },
    assetNetworks() {
      // Every network that holds the same registry asset, e.g. KSM on Kusama and Kusama AssetHub.
      const assetId = this.receiveBalance?.id ?? this.selectedAssetId;
      const filter = this.filterValue.toLowerCase();
      const networkNames = new Set<string>();

      return this.accountsStore.balances
        .flatMap(({ balances }) => balances)
        .flatMap(({ id, name, icon }) => {
          const network = isSameString(id, assetId) ? this.networksStore.getNetwork(name) : undefined;

          if (!network?.name || networkNames.has(network.name)) return [];

          networkNames.add(network.name);

          return [{ name: network.name, value: network.name, icon }];
        })
        .filter(({ name }) => name.toLowerCase().includes(filter));
    },
    address() {
      if (this.accountsStore.selectedWallet.address === '') return '';

      if (BaseApi.isBitcoinNetwork(this.selectedNetwork)) {
        const balance = this.accountsStore.balances
          .flatMap(({ balances }) => balances)
          .find(({ name }) => name.toLowerCase() === this.selectedNetwork.toLowerCase()) as
          | { bitcoinNextReceiveAddress?: string }
          | undefined;
        const nextReceiveAddress = balance?.bitcoinNextReceiveAddress;

        if (nextReceiveAddress && BaseApi.validateAddress(nextReceiveAddress, this.selectedNetwork)) {
          return nextReceiveAddress;
        }
      }

          return BaseApi.formatAddress(this.accountsStore.selectedWallet, this.selectedNetwork);
    },
    widthSaveBtn() {
      return IS_EXTENSION ? (this.showCopyBtn ? '260px' : '530px') : '100%';
    },
    showCopyBtn() {
      return !window.navigator.userAgent.toLowerCase().includes('firefox');
    },
  },
  mounted() {
    this.selectedNetwork = this.$route.params.network ?? '';
  },
  methods: {
    closeForm() {
      this.$router.back();
    },
    toggleSelectNetworkPopupVisible() {
      this.showSelectNetworkPopup = !this.showSelectNetworkPopup;
    },
    toggleSelectedNetwork(value: string) {
      this.selectedNetwork = value;

          this.toggleSelectNetworkPopupVisible();
    },
    handlerFilter(value: string) {
      this.filterValue = value;
    },
    copyAddress() {
      setClipboard(this.address);
    },
    createBlob() {
      const el = (this.$refs.qr as { $el: HTMLElement }).$el;
          const imgQR = el.firstChild as Element;
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');

          canvas.width = imgQR.clientWidth;
          canvas.height = imgQR.clientHeight;

          context?.drawImage(imgQR as CanvasImageSource, 0, 0);

          return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    },
    copyQR() {
      navigator.clipboard.write([
            new ClipboardItem({
              'image/png': this.createBlob() as Promise<Blob>,
            }),
          ]);
    },
    async saveQR() {
      saveAs((await this.createBlob()) as Blob, `${this.address}.png`);
    },
  },
});
</script>

<style lang="scss" scoped>
.select-network-popup {
  text-transform: capitalize;
}

.network-warning {
  width: 100%;
  margin-bottom: 16px;

  .evm-note {
    display: block;
    margin-top: 8px;
  }
}

.receive-form {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;

  .receive-content {
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    align-items: center;
  }

  .address-wrapper {
    display: flex;
    justify-content: space-between;
    padding: 16px 16px;
    width: 100%;
    color: rgba(255, 255, 255, 0.75);
    border-bottom: 0.5px solid $default-background-color;

    .address {
      display: flex;
    }
  }

  .copy-icon {
    width: 20px;
    height: 20px;
    margin-left: 16px;
    filter: invert(0.35);

    &:hover {
      cursor: pointer;

      filter: invert(0.25);
    }
  }

  .qr {
    margin: 16px 0;
  }

  .button {
    margin-left: 10px;

    &:first-child {
      margin-left: 0;
    }
  }

  .activity-buttons {
    display: flex;
  }
}
</style>

<style lang="scss" scoped>
.full-address {
  overflow-wrap: anywhere;
  white-space: normal;
  user-select: all;
  min-width: 0;
}
.receive-form .address-wrapper {
  box-sizing: border-box;
  flex-direction: column;
  gap: 8px;
  text-align: left;
}
.address-wrapper .address-header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.address-wrapper .network-chip {
  padding: 2px 10px;
  color: $default-white;
  font-size: 0.875rem;
  border: 1px solid $default-background-color;
  border-radius: 999px;
  overflow-wrap: anywhere;
}
.address-wrapper .address {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.address-wrapper button.copy-icon {
  appearance: none;
  flex: 0 0 44px;
  min-width: 44px;
  min-height: 44px;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  margin: 0;
}
.receive-form .activity-buttons {
  flex-wrap: wrap;
  gap: 12px;
  .button { max-width: 100%; }
}
</style>
