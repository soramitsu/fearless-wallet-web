<template>
  <AboveForm :fullScreen="true" header="assets.transaction" @closeHandler="onReject">
    <div v-if="isSignMobile" class="transaction-mobile">
      <Loader />

      <FButton
        text="common.cancel"
        width="100%"
        size="medium"
        fontSize="big"
        type="secondary"
        :border="false"
        @click="onReject"
      />
    </div>

    <div v-else class="transaction-content">
      <div>
        <WalletInfo class="wallet-info" :name="accountName" :address="address" />

        <InfoList>
          <InfoItem v-for="(value, key) in txInfo" :name="key" :value="value" :key="key" />
        </InfoList>
      </div>

      <div class="control-form">
        <FButton
          size="big"
          type="secondary"
          class="button"
          :disabled="state.isDisabled"
          :border="false"
          text="common.cancel"
          @click="onReject"
        />

        <FButton size="big" :disabled="state.isDisabled" class="button" text="common.accept" @click="sendExtrinsic" />
      </div>
    </div>
  </AboveForm>
</template>

<script lang="ts" setup>
import registry from '@extension-base/api/substrate/typeRegistry';
import { reactive, computed, onMounted } from 'vue';
import { type GenericExtrinsicPayload } from '@polkadot/types/extrinsic/ExtrinsicPayload';
import { formatUnits } from 'ethers';
import { type EvmRequestPayload, type SolanaRequestPayload } from '@extension-base/services/request-service/types';
import type { SignerPayloadJSON, SignerPayloadRaw } from '@polkadot/types/types';
import type { SigningRequest } from '@extension-base/background/types/types';
import type { ExtrinsicEra } from '@polkadot/types/interfaces';
import type { ApprovePayload } from '@/stores/extension/actions';
import BaseApi from '@/util/BaseApi';
import WalletInfo from '@/screens/extension-ui/signing/WalletInfo.vue';
import InfoList from '@/screens/extension-ui/InfoList.vue';
import InfoItem from '@/screens/extension-ui/InfoItem.vue';
import { cut } from '@/helpers';
import { useExtensionStore } from '@/stores/extension';
import { useAccountsStore } from '@/stores/accounts';

const state = reactive({
  isDisabled: false,
});

const extensionStore = useExtensionStore();
const accountsStore = useAccountsStore();

const payload = computed(() => extensionStore.signRequestPayload);
const requests = computed(() => extensionStore.signAllRequests);
const accounts = computed(() => accountsStore.accounts);
const selectedWallet = computed(() => accountsStore.selectedWallet);

type SubstratePayload = SignerPayloadJSON | SignerPayloadRaw;

const isEvmRequest = (value: unknown): value is EvmRequestPayload =>
  !!value && typeof value === 'object' && 'data' in value;

const isSolanaRequest = (value: unknown): value is SolanaRequestPayload =>
  !!value && typeof value === 'object' && 'ecosystem' in value && value.ecosystem === 'solana';

const isSubstrateRequest = (value: unknown): value is SigningRequest =>
  !!value && typeof value === 'object' && 'account' in value && 'request' in value;

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object';

const getEvmRequestData = (value: EvmRequestPayload): unknown[] => (Array.isArray(value.data) ? value.data : [value.data]);

const substratePayload = computed<SubstratePayload | undefined>(() =>
  payload.value && !isEvmRequest(payload.value) && !isSolanaRequest(payload.value) ? payload.value : undefined
);

const transactionAddress = computed(() => substratePayload.value?.address ?? selectedWallet.value.address);
const request = computed<SigningRequest | EvmRequestPayload | SolanaRequestPayload | undefined>(
  () => requests.value.substrate[0] ?? Object.values(requests.value.evm)[0] ?? Object.values(requests.value.solana)[0]
);

const isSignMobile = computed(() => {
  const encodedAddress = BaseApi.encodeAddress(transactionAddress.value);

  return accounts.value.some((account) => account.address === encodedAddress && account.isMobile);
});

const address = computed(() => {
  if (isEvmRequest(request.value)) {
    const data = getEvmRequestData(request.value);
    const first = data[0];

    if (isRecord(first) && first.from !== undefined) return String(first.from);

    return data[1] !== undefined ? String(data[1]) : '';
  }

  if (isSolanaRequest(request.value)) return request.value.account.address;

  return isSubstrateRequest(request.value) ? request.value.account.address : '';
});

const typedPayload = computed<GenericExtrinsicPayload | undefined>(() => {
  if (!substratePayload.value) return;

  if ('signedExtensions' in substratePayload.value) registry.setSignedExtensions(substratePayload.value.signedExtensions);

  const version = 'version' in substratePayload.value ? substratePayload.value.version : 4;

  return registry.createType('ExtrinsicPayload', substratePayload.value, { version });
});

const accountName = computed(() => {
  if (!request.value) return '';

  if (isSolanaRequest(request.value)) return request.value.account.name ?? request.value.account.address;

  if ('account' in request.value) return request.value.account.name;

  const data = getEvmRequestData(request.value);
  const first = data[0];

  if (isRecord(first) && first.from !== undefined) return String(first.from);

  return first !== undefined ? String(first) : '';
});

const onSignApprove = (data: ApprovePayload) => extensionStore.approveSign(data);

onMounted(async () => {
  if (isSignMobile.value && request.value && !isSolanaRequest(request.value)) onSignApprove({ id: request.value.id });
});

const mortalityAsString = (era: ExtrinsicEra | undefined, hexBlockNumber: string): string | undefined => {
  if (!era) return;

  if (era.isImmortalEra) return 'immortal';

  const { birth, death } = BaseApi.mortalityDecode(era, hexBlockNumber);

  return `mortal, valid from ${birth} to ${death}`;
};

const blockNumber = computed(() =>
  substratePayload.value && 'blockNumber' in substratePayload.value ? substratePayload.value.blockNumber : ''
);

const mortality = computed(() => mortalityAsString(typedPayload.value?.era, blockNumber.value));

const txInfo = computed(() => {
  if (!request.value) return {};

  const info: Record<string, string | number> = {
    url: request.value.url,
  };

  if (isEvmRequest(request.value)) {
    const requestData = getEvmRequestData(request.value);

    const [payload] = requestData;

    if (isRecord(payload)) {
      if (payload.gas !== undefined) info.gas = formatUnits(String(payload.gas), 'gwei');
      if (payload.value !== undefined) info.value = formatUnits(String(payload.value));
      if (payload.to !== undefined) info.to = cut(String(payload.to), 15);
      if (payload.from !== undefined) info.from = cut(String(payload.from), 15);
      if (payload.data !== undefined) info.data = cut(String(payload.data), 15);
    } else {
      info.data = payload !== undefined ? String(payload) : '';
    }
  } else if (isSolanaRequest(request.value)) {
    info.ecosystem = 'solana';
    info.method = request.value.method;
    info.address = cut(request.value.account.address, 15);

    if (request.value.method === 'signMessage' && request.value.messageBase64) {
      info.messageBytes = getBase64ByteLength(request.value.messageBase64);
      info.display = request.value.display ?? 'utf8';
      info.message = cut(request.value.messageBase64, 24);
    } else if (
      (request.value.method === 'signTransaction' || request.value.method === 'signAndSendTransaction') &&
      request.value.transactionBase64
    ) {
      const preview = request.value.transactionPreview;

      info.transactionBytes = preview?.transactionBytes ?? getBase64ByteLength(request.value.transactionBase64);
      info.transaction = cut(request.value.transactionBase64, 24);

      if (preview?.parseError) {
        info.previewError = preview.parseError;
      } else if (preview) {
        info.version = preview.version ?? '';
        info.requiredSignatures = preview.requiredSignatures ?? 0;
        info.signatureSlots = preview.signatureCount ?? 0;
        info.accountKeys = preview.accountCount ?? 0;
        info.instructions = preview.instructionCount ?? 0;
        info.addressTableLookups = preview.addressTableLookupCount ?? 0;
        if (preview.firstSigner) info.firstSigner = cut(preview.firstSigner, 15);
        if (preview.recentBlockhash) info.recentBlockhash = cut(preview.recentBlockhash, 15);
      }

      if (request.value.method === 'signAndSendTransaction') {
        info.preflightCommitment = request.value.options?.preflightCommitment ?? 'confirmed';
        info.skipPreflight = String(request.value.options?.skipPreflight ?? false);
        if (request.value.options?.maxRetries !== undefined) info.maxRetries = request.value.options.maxRetries;

        if (request.value.fee) {
          info.fee = request.value.fee.status;
          if (request.value.fee.slot !== undefined) info.feeSlot = request.value.fee.slot;
          if (request.value.fee.lamports !== undefined) info.feeLamports = request.value.fee.lamports;
          if (request.value.fee.error) info.feeError = cut(request.value.fee.error, 36);
        }

        if (request.value.simulation) {
          info.simulation = request.value.simulation.status;
          if (request.value.simulation.slot !== undefined) info.simulationSlot = request.value.simulation.slot;
          if (request.value.simulation.unitsConsumed !== undefined)
            info.simulationUnits = request.value.simulation.unitsConsumed;
          if (request.value.simulation.logCount !== undefined) info.simulationLogs = request.value.simulation.logCount;
          if (request.value.simulation.error) info.simulationError = cut(request.value.simulation.error, 36);
        }
      }
    } else if (request.value.transactionsBase64) {
      info.transactions = request.value.transactionsBase64.length;
      info.totalBytes = request.value.transactionsBase64.reduce((total, value) => total + getBase64ByteLength(value), 0);

      if (request.value.transactionPreviews) {
        const previewErrors = request.value.transactionPreviews.filter(({ parseError }) => parseError).length;

        info.parsedTransactions = request.value.transactionPreviews.length - previewErrors;
        if (previewErrors > 0) info.previewErrors = previewErrors;
      }
    }
  } else if (isSubstrateRequest(request.value)) {
    const substrateRequest = request.value;
    const data: Record<string, string | number | undefined> = {
      nonce: typedPayload.value?.nonce.toString(),
      wallet: substrateRequest.account.name,
      address: substrateRequest.account.address,
      genesisHash: typedPayload.value?.genesisHash.toString(),
      specVersion: typedPayload.value?.specVersion.toString(),
      method: typedPayload.value?.method.toString(),
      mortality: mortality.value,
    };

    for (const [key, value] of Object.entries(data)) {
      if (value) {
        info[key] = value;
      }
    }
  }

  return info;
});

const getBase64ByteLength = (value: string): number => {
  const normalized = value.replace(/=+$/, '');

  return Math.floor((normalized.length * 3) / 4);
};

const onReject = async () => {
  if (request.value) await extensionStore.signCancel(request.value.id);
};

const sendExtrinsic = async () => {
  if (!request.value) return;

  state.isDisabled = true;

  onSignApprove({ id: request.value.id });
};
</script>

<style lang="scss" scoped>
.transaction-content {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;

  .wallet-info {
    margin-bottom: 14px;
  }
}

.transaction-mobile {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-flow: column;
}

.row {
  margin-top: 15px;
}

.control-form {
  display: flex;
  flex-flow: row;
  width: 100%;
  gap: 6px;

  .button {
    width: 100%;
  }
}
</style>
