<template>
  <AboveForm
    header="Advanced"
    :showAcceptIcon="showAcceptIcon"
    :closeHandler="closeAdvancedForm"
    :saveChanges="saveChanges"
    class="advanced"
  >
    <Select
      v-model="substrateKeyPair"
      :options="optionsSubstrateKeyPair"
      placeholder="SUBSTRATE KEYPAIR CRYPTO TYPE"
      size="big"
      class="row"
    />

    <Input v-model="substrateDP" class="row" placeholder="Substrate secret derivation path" size="big" />

    <div class="example-prompt">Example: {{ example }}</div>

    <template v-if="showEthereumDP">
      <Input
        v-model="ethereumKeyPair"
        class="row"
        placeholder="ETHEREUM KEYPAIR CRYPTO TYPE"
        :readonly="true"
        size="big"
      />

      <Input
        v-model="ethereumDP"
        class="row"
        placeholder="Ethereum secret derivation path"
        :maxlength="25"
        size="big"
      />

      <div class="example-prompt">Example: m/44'/60'/0'/0/0</div>
    </template>
  </AboveForm>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import type { DerivationPath } from '@/interfaces/common';
import type { KeypairType } from '@polkadot/util-crypto/types';
import AboveForm from '@/components/AboveForm.vue';
import Input from '@/components/Input.vue';
import Select from '@/components/Select.vue';

@Component({
  components: {
    AboveForm,
    Input,
    Select,
  },
})
export default class AdvancedForm extends Vue {
  readonly optionsSubstrateKeyPair = [
    { label: 'Schnorrkel sr25519 (recommended)', value: 'sr25519', example: '//hard/soft///password' },
    { label: 'Edwards ed25519 (alternative)', value: 'ed25519', example: '//hard///password' },
    { label: 'ECDSA | BTC/ETH compatible', value: 'ecdsa', example: '//hard///password' },
  ];

  substrateDP = '';
  ethereumDP = '';
  substrateKeyPair = '';
  ethereumKeyPair = 'ETHEREUM';

  @Prop(Object) derivationPath!: DerivationPath;
  @Prop({ default: true }) showEthereumDP!: boolean;

  get example() {
    return this.optionsSubstrateKeyPair.find(({ value }) => value === this.substrateKeyPair)?.example;
  }

  get showAcceptIcon() {
    return !!this.substrateDP || !!this.ethereumDP;
  }

  mounted() {
    this.substrateDP = this.derivationPath.substrate.value;
    this.ethereumDP = this.derivationPath.ethereum.value;
    this.substrateKeyPair = this.derivationPath.substrate.keyPair;
  }

  closeAdvancedForm() {
    this.$emit('toggleAdvancedFormVisible', false);
  }

  saveChanges() {
    const derivationPath: DerivationPath = {
      substrate: {
        value: this.substrateDP,
        keyPair: this.substrateKeyPair as KeypairType,
      },
      ethereum: {
        value: this.ethereumDP,
        keyPair: 'ethereum',
      },
    };

    this.$emit('saveChanges', derivationPath, 'derivationPath');
    this.closeAdvancedForm();
  }
}
</script>

<style lang="scss" scoped>
.advanced {
  .row {
    margin-top: 16px;

    &:first-child {
      margin-top: 0;
    }
  }

  .example-prompt {
    color: rgba(255, 255, 255, 0.65);
    font-size: 14px;
    text-align: left;
    line-height: 180%;
    margin: 16px 0;
  }
}
</style>
