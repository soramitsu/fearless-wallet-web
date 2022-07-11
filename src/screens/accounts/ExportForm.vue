<template>
  <AboveForm header="Export JSON" :showBackIcon="showBackIcon" :handlerBack="handlerBack" :closeHandler="closeForm">
    <div class="export-form">
      <div class="export-content">
        <Input v-model="exportType" placeholder="Source type" size="big" class="export-type-input" />

        <template v-if="step === 1">
          <InformationBlock
            class="info-block"
            text="Password is required to encrypt your account and store as Restore JSON. Please, create password to continue
          operation."
          />

          <ValidatedInput
            v-model="pass1"
            placeholder="Set password for json file"
            errorDescriptions="Password is too short"
            :isError="isErrorPass1"
            :showPassword="true"
            :maxlength="25"
          />

          <ValidatedInput
            v-model="pass2"
            :class="classesPass2"
            placeholder="Confirm password"
            errorDescriptions="Passwords do not match."
            :isError="isErrorPass2"
            :showPassword="true"
            :maxlength="25"
          />
        </template>

        <template v-else-if="step === 2">
          <Input v-model="substrateAddress" class="row" size="big" placeholder="Substrate" :readonly="true" />

          <Input
            v-if="haveEthereumAccount"
            v-model="ethereumAddress"
            class="row"
            size="big"
            placeholder="Ethereum"
            :readonly="true"
          />
        </template>
      </div>

      <Button size="big" fontSize="big" width="100%" :text="buttonText" :disabled="disabledButton" @click="proceed" />
    </div>
  </AboveForm>
</template>

<script lang="ts">
import Input from '@/components/Input.vue';
import Button from '@/components/Button.vue';
import keyring from '@polkadot/ui-keyring';
import AboveForm from '@/components/AboveForm.vue';
import ValidatedInput from '@/components/ValidatedInput.vue';
import InformationBlock from '@/components/InformationBlock.vue';
import { Getter } from 'vuex-class';
import { Vue, Component, Prop } from 'vue-property-decorator';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import type { SelectedWallet } from '@/store/accounts/types';
import type { KeyringPair$Json } from '@polkadot/keyring/types';

@Component({
  components: {
    Input,
    Button,
    AboveForm,
    ValidatedInput,
    InformationBlock,
  },
})
export default class ExportForm extends Vue {
  exportType = 'Restore JSON';
  pass1 = '';
  pass2 = '';
  step = 1;

  @Prop(Function) closeForm!: VoidFunction;

  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;

  get haveEthereumAccount() {
    const accounts = keyring.getAccounts();
    const indexEthereum = accounts.findIndex(({ address }) => address === this.selectedWallet.ethereumAddress);

    return indexEthereum !== -1;
  }

  get substrateAddress() {
    return JSON.stringify({ address: this.selectedWallet.address });
  }

  get ethereumAddress() {
    return JSON.stringify({ address: this.selectedWallet.ethereumAddress });
  }

  get showBackIcon() {
    return this.step === 2;
  }

  get buttonText() {
    return this.step === 1 ? 'Continue' : 'Export';
  }

  get classesPass2() {
    return [
      {
        row: !this.isErrorPass1,
      },
    ];
  }

  get isErrorPass1() {
    return this.pass1 !== '' && this.pass1.length < 5;
  }

  get isErrorPass2() {
    return this.pass2 !== '' && this.pass2 !== this.pass1;
  }

  get disabledButton() {
    return this.pass2 === '' || this.pass2 !== this.pass1;
  }

  proceed() {
    if (this.step === 1) this.step = 2;
    else this.export();
  }

  export() {
    const a = document.createElement('a');

    const pairSubstrate = keyring.getPair(this.selectedWallet.address).toJson(this.pass1);
    const substrateJson = JSON.stringify(pairSubstrate);
    const fileSubstrate = new Blob([substrateJson], { type: 'application/json' });

    a.href = URL.createObjectURL(fileSubstrate);
    a.download = 'substrate.json';
    a.click();

    if (this.haveEthereumAccount) {
      const pairEthereum = keyring.getPair(this.selectedWallet.ethereumAddress).toJson(this.pass1);
      const ethereumJson = JSON.stringify(pairEthereum);
      const fileEthereum = new Blob([ethereumJson], { type: 'application/json' });

      a.href = URL.createObjectURL(fileEthereum);
      a.download = 'ethereum.json';
      a.click();
    }
  }

  handlerBack() {
    this.pass1 = '';
    this.pass2 = '';
    this.step = 1;
  }
}
</script>

<style lang="scss" scoped>
.export-form {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;

  .export-content {
    display: flex;
    flex-direction: column;
  }

  .info-block {
    margin: 25px 0;
  }

  .export-type-input {
    width: 100%;
  }

  .row {
    margin-top: 16px;
  }
}
</style>
