<template>
  <AboveForm header="assets.receiveFunds" :fullScreen="true" @closeHandler="closeForm">
    <div class="receive-form">
      <div>
        <InputWithIcon
          placeholder="assets.network"
          icon="rotate"
          data-testid="selectedNetwork"
          :value="selectedNetwork"
          :ref="selectNetworkInputRef"
          :isActiveRotate="showSelectNetworkPopup"
          @click="toggleSelectNetworkPopupVisible"
        />

        <div class="receive-content">
          <div class="address-wrapper">
            <span>{{ $t('assets.walletAddress') }}</span>

            <div class="address" data-testid="cutAddress">
              {{ cutAddress }}

              <Icon icon="copy" className="copy-icon" data-testid="copyAddress" @click="copyAddress" />
            </div>
          </div>

          <QR class="qr" ref="qrRef" data-testid="qr" :showLogo="true" :width="200" :payload="address" />
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
      :value="selectedNetwork"
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

<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { saveAs } from 'file-saver';
import type { ComponentPublicInstance } from 'vue';
import BaseApi from '@/util/BaseApi';
import { cut, setClipboard } from '@/helpers';
import { IS_EXTENSION } from '@/consts/global';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

const selectNetworkInputRef = 'selectNetworkInput';
const copyQRTooltip = {
  text: 'common.copiedValue',
  localeProps: { value: 'QR' },
} as const;

const networksStore = useNetworksStore();
const accountsStore = useAccountsStore();
const router = useRouter();
const route = useRoute();
const filterValue = ref('');
const selectedNetwork = ref('polkadot');
const showSelectNetworkPopup = ref(false);
const qrRef = ref<ComponentPublicInstance | null>(null);

const selectedAssetId = computed(() => (route.params.assetId as string | undefined) ?? '');

const popupLeft = computed(() => (IS_EXTENSION ? -160 : 0));

const assetNetworks = computed(() => {
  const currency = accountsStore.balances.find(({ groupId }) => groupId === selectedAssetId.value);
  const filter = filterValue.value.toLowerCase();

  return (
    currency?.balances
      .map(({ name, icon }) => {
        const network = networksStore.getNetwork(name);

        return {
          name: network.name,
          value: network.name,
          icon,
        };
      })
      .filter(({ name }) => name.toLowerCase().includes(filter)) ?? []
  );
});

const address = computed(() => {
  const walletAddress = accountsStore.selectedWallet.address;

  if (walletAddress === '') return '';

  return BaseApi.formatAddress(accountsStore.selectedWallet, selectedNetwork.value);
});

const cutAddress = computed(() => cut(address.value, 5));

const widthSaveBtn = computed(() => (IS_EXTENSION ? (showCopyBtn.value ? '260px' : '530px') : '100%'));

const showCopyBtn = computed(() => !window.navigator.userAgent.toLowerCase().includes('firefox'));

onMounted(() => {
  selectedNetwork.value = (route.params.network as string | undefined) ?? 'polkadot';
});

function closeForm() {
  router.back();
}

function toggleSelectNetworkPopupVisible() {
  showSelectNetworkPopup.value = !showSelectNetworkPopup.value;
}

function toggleSelectedNetwork(value: string) {
  selectedNetwork.value = value;
  toggleSelectNetworkPopupVisible();
}

function handlerFilter(value: string) {
  filterValue.value = value;
}

function copyAddress() {
  setClipboard(address.value);
}

function createBlob(): Promise<Blob | null> {
  const qrComponent = qrRef.value?.$el as HTMLElement | undefined;
  const img = qrComponent?.firstChild as HTMLImageElement | undefined;

  if (!img) return Promise.resolve(null);

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  canvas.width = img.clientWidth;
  canvas.height = img.clientHeight;

  if (context) context.drawImage(img, 0, 0);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
}

async function copyQR() {
  const blob = await createBlob();

  if (!blob) return;

  await navigator.clipboard.write([
    new ClipboardItem({
      'image/png': Promise.resolve(blob),
    }),
  ]);
}

async function saveQR() {
  const blob = await createBlob();

  if (!blob) return;

  saveAs(blob, `${address.value}.png`);
}
</script>

<style lang="scss" scoped>
.select-network-popup {
  text-transform: capitalize;
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
