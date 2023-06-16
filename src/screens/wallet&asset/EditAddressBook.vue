<template>
  <div class="add-contact">
    <div>
      <Input v-model="name" placeholder="common.name" typeText="uppercase" size="big" class="row" :maxlength="45" />

      <ValidatedInput
        v-model="address"
        placeholder="assets.walletAddress"
        class="row"
        errorDescriptions="assets.invalidAccountAddress"
        :isError="isErrorAddress"
      />
    </div>

    <Button size="big" text="common.save" :disabled="buttonDisabled" @click="updateContact" />
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

  @Prop({ default: '' }) _name!: string;
  @Prop(String) _address!: string;
  @Prop(Boolean) isActive!: boolean;

  get buttonDisabled() {
    return this.name === '' || this.address === '' || this.isErrorAddress;
  }

  get isErrorAddress() {
    return (
      this.address.length !== 0 &&
      !(BaseApi.validateAddress(this.address, 'polkadot') || BaseApi.validateAddress(this.address, 'moonbeam'))
    );
  }

  mounted() {
    this.name = this._name;
    this.address = this._address;
  }

  async updateContact() {
    const { addressBook } = await storage.get(['addressBook']);

    chrome.storage.local.set({
      addressBook: [...addressBook, { name: this.name, address: BaseApi.encodeAddress(this.address) }],
    });

    this.$emit('setAddress', '', true);
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
}
</style>
