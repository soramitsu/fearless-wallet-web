<template>
  <div class="add-contact">
    <div class="form">
      <FInput
        v-model="name"
        placeholder="common.name"
        typeText="uppercase"
        size="big"
        class="row"
        :maxlength="45"
        data-testid="nameInput"
      />

      <ValidatedInput
        v-model="address"
        placeholder="assets.walletAddress"
        class="row"
        errorDescriptions="accounts.invalidAccountAddress"
        :isError="isErrorAddress"
        data-testId="walletAddressInput"
      />

      <Checkbox
        :value="saveForAllNetworks"
        size="medium"
        :label="$t('assets.saveAddressForAllNetwork')"
        class="row"
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
import { Vue, Component, Prop } from 'vue-property-decorator';
import { storage } from '@extension-base/stores/Storage';

import BaseApi from '@/util/BaseApi';
@Component
export default class EditAddressBook extends Vue {
  name = '';
  address = '';
  saveForAllNetworks = false;

  @Prop({ default: '' }) _name!: string;
  @Prop(String) _address!: string;
  @Prop(String) network!: string;
  @Prop(Boolean) isActive!: boolean;

  get buttonDisabled() {
    return this.name === '' || this.address === '' || this.isErrorAddress;
  }

  get isErrorAddress() {
    const address = this.address.trim();

    return (
      address.length !== 0 &&
      !(BaseApi.validateAddress(address, 'polkadot') || BaseApi.validateAddress(address, 'moonbeam'))
    );
  }

  mounted() {
    this.name = this._name;
    this.address = this._address;
  }

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

    this.$emit('setAddress', '', true);
  }

  onSave(value: boolean) {
    this.saveForAllNetworks = value;
  }
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
