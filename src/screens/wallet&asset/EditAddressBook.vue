<template>
  <div class="add-contact">
    <div class="form">
      <FInput
        :value="name"
        placeholder="common.name"
        typeText="uppercase"
        size="big"
        class="row"
        :maxlength="45"
        data-testid="nameInput"
        @change="changeName"
      />

      <ValidatedInput
        :value="address"
        :isError="isErrorAddress"
        placeholder="assets.walletAddress"
        class="row"
        errorDescriptions="accounts.invalidAccountAddress"
        data-testId="walletAddressInput"
        @change="changeAddress"
      />

      <Checkbox
        :value="saveForAllNetworks"
        :label="$t('assets.saveAddressForAllNetwork')"
        size="medium"
        class="row"
        data-testid="saveForAllNetworks"
        @change="onSave"
      />
    </div>

    <FButton
      size="big"
      text="common.save"
      :disabled="buttonDisabled"
      data-testid="updateContact"
      @click="updateContact"
    />
  </div>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import { storage } from '@extension-base/stores/Storage';
import BaseApi from '@/util/BaseApi';
import { useAccountsStore } from '@/stores/accounts';

const props = defineProps<{
  _name?: string;
  _address: string;
  network: string;
  isActive: boolean;
}>();

const emit = defineEmits<{
  toggleEditBook: [];
}>();

const accountsStore = useAccountsStore();

const name = ref(props._name ?? '');
const address = ref(props._address ?? '');
const saveForAllNetworks = ref(false);

watch(
  () => props._name,
  (value) => {
    name.value = value ?? '';
  }
);

watch(
  () => props._address,
  (value) => {
    address.value = value ?? '';
  }
);

const trimmedAddress = computed(() => address.value.trim());

const isErrorAddress = computed(() => {
  const currentAddress = trimmedAddress.value;

  if (currentAddress.length === 0) return false;

  if (accountsStore.selectedWallet.isTon) return false;

  return !(BaseApi.validateAddress(currentAddress, 'polkadot') || BaseApi.validateAddress(currentAddress, 'moonbeam'));
});

const buttonDisabled = computed(() => name.value === '' || trimmedAddress.value === '' || isErrorAddress.value);

function changeName(value: string) {
  name.value = value;
}

function changeAddress(value: string) {
  address.value = value;
}

async function updateContact() {
  const { addressBook } = await storage.get(['addressBook']);
  const key = saveForAllNetworks.value ? 'all' : props.network;
  const value = addressBook[key] ?? [];

  storage.set({
    addressBook: {
      ...addressBook,
      [key]: [...value, { name: name.value, address: BaseApi.encodeAddress(trimmedAddress.value) }],
    },
  });

  emit('toggleEditBook');
}

function onSave(value: boolean) {
  saveForAllNetworks.value = value;
}
</script>

<style lang="scss" scoped>
.add-contact {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;

  .row {
    margin-top: 16px;
  }

  .form {
    text-align: left;
  }
}
</style>
