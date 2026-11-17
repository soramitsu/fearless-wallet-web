<template>
  <AboveForm :header="formHeader" :fullScreen="true" @closeHandler="closeForm">
    <div class="receive-form">
      <div>
        <InputWithIcon
          placeholder="assets.network"
          icon="rotate"
          data-testid="selectedNetwork"
          :value="networkName"
          :isActiveRotate="picker === 'network'"
          @click="openPicker('network')"
        />

        <InputWithIcon
          v-if="chainFirst && address && networkTokens.length"
          placeholder="walletHome.picker.optionalToken"
          icon="rotate"
          class="token-selector"
          data-testid="receiveToken"
          :value="receiveSymbol || $t('walletHome.picker.noToken')"
          :isActiveRotate="picker === 'token'"
          @click="openPicker('token')"
        />

        <div v-if="address" class="receive-content">
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

          <Alert v-if="isExposedWallet" class="network-warning" data-testid="receiveExposedWallet">
            {{ $t('exposureNotice.receiveWarning') }}
          </Alert>

          <Alert v-if="showSendUnavailable" class="network-warning send-unavailable" data-testid="receiveSendUnavailable">
            {{ $t(receiveSymbol ? 'assets.receiveSendUnavailable' : 'walletHome.picker.sendUnavailable', { symbol: receiveSymbol, network: networkName }) }}
          </Alert>

          <QR class="qr" ref="qr" data-testid="qr" :showLogo="true" :width="200" :payload="address" />

          <Alert v-if="networkName" class="network-warning" data-testid="receiveNetworkWarning">
            <span data-testid="receiveOnlyOnNetwork">
              {{ $t(receiveSymbol ? 'assets.receiveOnlyOnNetwork' : 'walletHome.picker.networkWarning', { symbol: receiveSymbol, network: networkName }) }}
            </span>
            <span v-if="isEvmNetwork" class="evm-note" data-testid="receiveEvmSameAddress">
              {{ $t('assets.receiveEvmSameAddress') }}
            </span>
          </Alert>
        </div>

        <Alert v-else role="status">{{ $t('walletHome.picker.addressUnavailable', { network: networkName }) }}</Alert>

        <Tooltip v-if="address" text="common.copied" target=".copy-icon" placement="bottom" trigger="click" />
      </div>

      <div v-if="address" class="activity-buttons">
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
      v-if="picker"
      data-testid="receiveChoices"
      :placeholder="picker === 'network' ? 'walletHome.picker.searchNetworks' : 'walletHome.picker.search'"
      :value="picker === 'network' ? networkName : selectedAssetId"
      :options="picker === 'network' ? assetNetworks : tokenOptions"
      @handlerFilter="filterValue = $event"
      @toggleValue="picker === 'network' ? toggleSelectedNetwork($event) : selectToken($event)"
      @handlerClose="picker = null"
    />
  </AboveForm>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import { saveAs } from 'file-saver';
import { getNativeAssetName } from '@extension-base/background/handlers/utils';
import type { LegacyExposureStatus } from '@extension-base/services/legacy-exposure-service';
import BaseApi from '@/util/BaseApi';
import { isSameString, setClipboard } from '@/helpers';
import { findTransferAssetGroup } from '@/helpers/currencies';
import { receiveAddressForNetwork } from '@/helpers/receiveAddress';
import { IS_EXTENSION } from '@/consts/global';
import { getPortfolioAssetId } from '@/portfolio/assetIdentity';
import { useReceiveNetworks } from '@/portfolio/useReceiveNetworks';
import { isNetworkTransferEnabled } from '@/util/releaseFeatures';
import { getLegacyExposureStatus } from '@/extension/messaging/legacy-exposure';
import { isLegacyExposedAddress } from '@/util/legacyExposure';
import { canonicalGroupIndexFor, canonicalGroupOf } from '@/portfolio/tokenGroups';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

export default defineComponent({
  name: 'ReceiveForm',
  setup() {
    return { receiveNetworks: useReceiveNetworks() };
  },
  data() {
    return {
      copyQRTooltip: {
        text: 'common.copiedValue',
        localeProps: { value: 'QR' },
      },
      networksStore: useNetworksStore(),
      accountsStore: useAccountsStore(),
      filterValue: '',
      selectedNetwork: String(this.$route.params.network ?? ''),
      pickedAssetId: '',
      picker: null as 'network' | 'token' | null,
      legacyExposure: undefined as LegacyExposureStatus | undefined,
    };
  },
  computed: {
    chainFirst() {
      return !this.$route.params.assetId;
    },
    selectedAssetId(): string {
      return this.pickedAssetId || String(this.$route.params.assetId ?? '');
    },
    receiveBalance() {
      const currency = findTransferAssetGroup(this.accountsStore.balances, this.selectedAssetId, this.selectedNetwork);

      return currency?.balances.find(({ name }) => isSameString(name, this.selectedNetwork));
    },
    selectedNetworkJson() {
      if (this.chainFirst) return this.receiveNetworks.find(({ name }) => isSameString(name, this.selectedNetwork));

      return this.selectedNetwork ? this.networksStore.getNetwork(this.selectedNetwork) : undefined;
    },
    networkName() {
      return this.selectedNetworkJson?.name ?? this.selectedNetwork;
    },
    networkTokens() {
      const tokens = new Map<string, { name: string; value: string; icon: string; subName: string }>();
      const network = this.selectedNetworkJson;
      if (!network) return [];

      for (const asset of network.assets) {
        tokens.set(asset.id, { name: getNativeAssetName(asset.symbol).toUpperCase(), value: asset.id, icon: asset.icon, subName: asset.name });
      }
      for (const group of this.accountsStore.balances) {
        for (const balance of group.balances) {
          if (!isSameString(balance.name, network.name) || balance.assetMetadataTrust !== 'verified') continue;
          const id = getPortfolioAssetId(balance);
          if (!tokens.has(id)) {
            tokens.set(id, { name: getNativeAssetName(balance.symbol).toUpperCase(), value: id, icon: group.icon, subName: group.tokenName });
          }
        }
      }
      return [...tokens.values()].sort((a, b) => a.name.localeCompare(b.name));
    },
    tokenOptions() {
      const filter = this.filterValue.trim().toLowerCase();
      const options = this.networkTokens.filter(({ name, subName }) => `${name} ${subName}`.toLowerCase().includes(filter));
      if (filter) return options;

      return [{ name: this.$t('walletHome.picker.noToken'), value: '', icon: 'globus', isAll: true }, ...options];
    },
    receiveSymbol() {
      if (this.chainFirst) return this.networkTokens.find(({ value }) => value === this.pickedAssetId)?.name ?? '';

      const symbol = this.receiveBalance?.symbol ??
        this.selectedNetworkJson?.assets?.find(({ id }) => id === this.selectedAssetId)?.symbol ??
        this.selectedNetworkJson?.assets?.[0]?.symbol ?? '';

      return getNativeAssetName(symbol).toUpperCase();
    },
    formHeader() {
      if (!this.receiveSymbol) return 'assets.receiveFunds';

      return { text: 'assets.receiveTokenTitle', localeProps: { symbol: this.receiveSymbol } };
    },
    isEvmNetwork() {
      const ecosystem = this.selectedNetworkJson?.ecosystem;
      return ecosystem === 'ethereum' || ecosystem === 'ethereumBased' || BaseApi.isEthereumNetwork(this.selectedNetwork);
    },
    showSendUnavailable() {
      // Say before the QR code when this build cannot send from the network (Iroha), so
      // nobody deposits expecting to move the funds on from Fearless. Bitcoin and Solana
      // sends ship enabled and get no paused copy; only an emergency veto hides their Send.
      const network = this.selectedNetworkJson;

      if (!network?.name || network.ecosystem === 'bitcoin' || network.ecosystem === 'solana') return false;

      return !isNetworkTransferEnabled(network);
    },
    // The approved token group of the asset (portfolio contract §7): its other networks, by (chainId, assetId).
    groupNetworkAssets() {
      const members = new Map<string, string>();
      const index = canonicalGroupIndexFor(this.networksStore.allNetworks ?? []);
      const group = canonicalGroupOf(index, this.selectedNetworkJson, this.receiveBalance?.id ?? this.selectedAssetId)?.group;

      group?.members.forEach(({ networkName, assetId }) => {
        if (!members.has(networkName)) members.set(networkName, assetId);
      });

      return members;
    },
    assetNetworks() {
      // Every network that holds the same registry asset, e.g. KSM on Kusama and Kusama AssetHub, and every network
      // of the asset's token group, e.g. DOT on the parachains that hold reserve-backed DOT.
      const filter = this.filterValue.trim().toLowerCase();
      if (this.chainFirst) {
        return this.receiveNetworks
          .filter(({ name }) => name.toLowerCase().includes(filter))
          .map(({ name, icon }) => ({ name, value: name, icon }));
      }

      const assetId = this.receiveBalance?.id ?? this.selectedAssetId;
      const networkNames = new Set<string>();
      const isMember = (id: string, name: string) =>
        [...this.groupNetworkAssets].some(
          ([networkName, memberId]) => isSameString(name, networkName) && isSameString(id, memberId)
        );

      return this.accountsStore.balances
        .flatMap(({ balances }) => balances)
        .flatMap(({ id, name, icon }) => {
          const network = isSameString(id, assetId) || isMember(id, name) ? this.networksStore.getNetwork(name) : undefined;

          if (!network?.name || networkNames.has(network.name)) return [];

          networkNames.add(network.name);

          return [{ name: network.name, value: network.name, icon }];
        })
        .filter(({ name }) => name.toLowerCase().includes(filter));
    },
    address() {
      const wallet = this.accountsStore.selectedWallet;
      const network = this.selectedNetworkJson;
      if (!wallet.address || !network) return '';

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

      const account = this.accountsStore.accounts.find(({ address }) => address === wallet.address);
      return receiveAddressForNetwork(wallet, account, network);
    },
    widthSaveBtn() {
      return IS_EXTENSION ? (this.showCopyBtn ? '260px' : '530px') : '100%';
    },
    showCopyBtn() {
      return !window.navigator.userAgent.toLowerCase().includes('firefox');
    },
    isExposedWallet() {
      // A wallet from before the update from 3.0.x: its phrase may be known to someone else.
      return isLegacyExposedAddress(this.legacyExposure, this.accountsStore.selectedWallet.address);
    },
  },
  mounted() {
    void this.loadLegacyExposure();
  },
  methods: {
    async loadLegacyExposure() {
      try {
        this.legacyExposure = await getLegacyExposureStatus();
      } catch {
        // Without an answer the address is shown as before, without the warning.
      }
    },
    closeForm() {
      this.$router.back();
    },
    openPicker(picker: 'network' | 'token') {
      this.filterValue = '';
      this.picker = picker;
    },
    selectToken(id: string) {
      this.pickedAssetId = id;
      this.picker = null;
    },
    toggleSelectedNetwork(value: string) {
      if (this.chainFirst) {
        if (!isSameString(value, this.selectedNetwork)) this.pickedAssetId = '';
      } else {
        // A token opened from its own page can have a different registry id on the next network.
        this.pickedAssetId = this.groupNetworkAssets.get(this.networksStore.getNetwork(value)?.name ?? value) ?? this.selectedAssetId;
      }
      this.selectedNetwork = value;
      this.picker = null;
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
.token-selector {
  margin-top: 8px;
}

.network-warning {
  width: 100%;
  margin-bottom: 16px;

  &.send-unavailable {
    margin: 16px 0 0;
  }

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
    border-bottom: 0.5px solid palette($default-background-color, var(--fw-divider));

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
  border: 1px solid palette($default-background-color, var(--fw-divider));
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
