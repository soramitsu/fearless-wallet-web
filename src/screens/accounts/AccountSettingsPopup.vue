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
    @handlerClose="handleClose"
  >
    <div class="account-settings">
      <div v-if="showExport" class="row" @click="emit('openExportAccountPage')">
        <Icon icon="export" className="icon" />

        <div class="label" data-testid="exportAccount">{{ $t('accounts.exportAccount') }}</div>
      </div>

      <div v-if="showNodeSwitch" class="row" @click="openNetwork">
        <Icon icon="currency-switch" className="icon" />

        <div class="label" data-testid="switchNode">{{ $t('accounts.switchNode') }}</div>
      </div>

      <div v-if="showCopyAddress" class="row" @click="copyAddress">
        <Icon icon="copy-2" className="icon" />

        <div class="label" data-testid="copyAddress">{{ $t('accounts.copyAddress') }}</div>
      </div>

      <div v-if="haveExplorers" class="row" @click="openExplorer">
        <Icon icon="globus" className="icon" />

        <div class="label" data-testid="viewIn">{{ buttonText }}</div>
      </div>
    </div>
  </Popup>
</template>

<script lang="ts" setup>
import { computed, toRefs } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import BaseApi from '@/util/BaseApi';
import { Components } from '@/router/routes';
import { EXPLORERS_BASE_URLS } from '@/consts/networks';
import { setClipboard } from '@/helpers';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

const props = withDefaults(
  defineProps<{
    selectedNetwork: string;
    showNodeSwitch?: boolean;
    showCopyAddress?: boolean;
    showExport?: boolean;
    buttonTopClick?: number;
  }>(),
  {
    showNodeSwitch: false,
    showCopyAddress: false,
    showExport: false,
    buttonTopClick: 110,
  }
);

const emit = defineEmits<{
  handlerClose: [];
  openExportAccountPage: [];
}>();

const { showExport, showNodeSwitch, showCopyAddress } = toRefs(props);

const networksStore = useNetworksStore();
const accountsStore = useAccountsStore();
const router = useRouter();
const { t } = useI18n();

const networkProps = computed(() => networksStore.getNetwork(props.selectedNetwork));
const explorerType = computed(() => networkProps.value?.externalApi?.history?.type);

const explorerUrl = computed(() => {
  if (networkProps.value?.externalApi?.explorers) {
    return networkProps.value.externalApi.explorers[0]?.url ?? '';
  }

  return '';
});

const haveExplorers = computed(() => explorerUrl.value !== '');

const buttonText = computed(() => {
  const explorer =
    explorerType.value === 'etherscan'
      ? 'accounts.etherscan'
      : explorerType.value === 'ton'
        ? 'accounts.tonviewer'
        : 'accounts.subscan';

  return t(explorer);
});

const top = computed(() => {
  if (props.buttonTopClick === undefined) return 110;

  if (props.buttonTopClick > 300) return props.buttonTopClick - 181;

  return props.buttonTopClick + 7;
});

const addressByNetwork = computed(() => BaseApi.formatAddress(accountsStore.selectedWallet, props.selectedNetwork));
const lowerCaseSelectedNetwork = computed(() => props.selectedNetwork.toLowerCase());
const substrateExplorerByNetwork = computed(
  () => EXPLORERS_BASE_URLS[lowerCaseSelectedNetwork.value] ?? props.selectedNetwork
);

const handleClose = () => emit('handlerClose');

const copyAddress = () => {
  setClipboard(addressByNetwork.value);
  handleClose();
};

const openEvmExplorer = () => {
  if (!explorerUrl.value) return;

  const hostname = new URL(explorerUrl.value).hostname;

  window.open(`https://${hostname}/address/${addressByNetwork.value}`);
};

const openSubscan = () => {
  window.open(`https://${substrateExplorerByNetwork.value}.subscan.io/account/${addressByNetwork.value}`);
};

const openExplorer = () => {
  if (explorerType.value === 'etherscan') {
    openEvmExplorer();
  } else {
    openSubscan();
  }

  close();
};

const openNetwork = () => {
  router.push({
    name: Components.Nodes,
    params: {
      network: props.selectedNetwork,
    },
  });

  close();
};
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
