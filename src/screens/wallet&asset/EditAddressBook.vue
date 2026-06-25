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

<script lang="ts">
import { defineComponent } from 'vue';

import { storage } from '@extension-base/stores/Storage';
import BaseApi from '@/util/BaseApi';
import { useAccountsStore } from '@/stores/accounts';

export default defineComponent({ name: 'EditAddressBook' ,
  props: {
    _name: { default: '' },
    _address: String,
    network: String,
    isActive: Boolean,
  },
  data() {
    return {
      accountStore: useAccountsStore(),
      name: '',
      address: '',
      saveForAllNetworks: false,
    };
  },
  computed: {
    buttonDisabled() {
      return this.name === '' || this.address.trim() === '' || this.isErrorAddress;
    },
    isErrorAddress() {
      const address = this.address.trim();

          if (address.length === 0) return false;

          // TODO ton
          if (this.accountStore.selectedWallet.isTon) return false;

          return !(BaseApi.validateAddress(address, 'polkadot') || BaseApi.validateAddress(address, 'moonbeam'));
    },
  },
  mounted() {
    this.name = this._name;
        this.address = this._address;
  },
  methods: {
    changeName(value: string) {
      this.name = value;
    },
    changeAddress(value: string) {
      this.address = value;
    },
    async updateContact() {
      const { addressBook } = await storage.get(['addressBook']);
          const key = this.saveForAllNetworks ? 'all' : this.network;
          const value = addressBook[key] ?? [];

          storage.set({
            addressBook: {
              ...addressBook,
              [key]: [...value, { name: this.name, address: BaseApi.encodeAddress(this.address.trim()) }],
            },
          });

          this.$emit('toggleEditBook');
    },
    onSave(value: boolean) {
      this.saveForAllNetworks = value;
    },
  },
});
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
