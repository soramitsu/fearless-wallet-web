<template>
  <AboveForm
    header="Advanced"
    :showAcceptIcon="showAcceptIcon"
    :closeHandler="closeAdvancedForm"
    :saveChanges="saveChanges"
    class="advanced"
  >
    <s-select v-model="substrateKeyPair" class="input" placeholder="SUBSTRATE KEYPAIR CRYPTO TYPE" size="big">
      <s-option
        v-for="option in optionsSubstrateKeyPair"
        :key="option.value"
        :value="option.value"
        :label="option.label"
      />
    </s-select>
    <s-input v-model="substrateDP" type="text" placeholder="Substrate secret derivation path" class="input" />
    <div class="example-prompt">Example: //hard/soft///password</div>
    <div v-if="showEthereumDP">
      <s-input
        value="ECDSA | BTC/ETH compatible"
        type="text"
        placeholder="ETHEREUM KEYPAIR CRYPTO TYPE"
        :readonly="true"
        class="input"
      />
      <s-input
        v-model="ethereumDP"
        type="text"
        placeholder="Ethereum secret derivation path"
        maxlength="25"
        class="input"
      />
      <div class="example-prompt">Example: 44’/0’/0’/0</div>
    </div>
  </AboveForm>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { DerivationPath } from '../../interfaces/connectionWallet';
import type { KeypairType } from '@polkadot/util-crypto/types';
import AboveForm from '../../components/AboveForm.vue';

@Component({
  components: {
    AboveForm,
  },
})
export default class extends Vue {
  @Prop(Object) derivationPath!: DerivationPath;
  @Prop({ default: true }) showEthereumDP!: boolean;

  substrateDP = '';
  ethereumDP = '';
  substrateKeyPair = '';
  ethereumKeyPair = '';
  optionsSubstrateKeyPair = [
    { label: 'Schnorrkel | sr25519 (recommended)', value: 'sr25519' },
    { label: 'ed25519', value: 'ed25519' },
    { label: 'ethereum', value: 'ethereum' },
  ];

  get showAcceptIcon() {
    return !!this.substrateDP || !!this.ethereumDP;
  }

  mounted() {
    this.substrateDP = this.derivationPath.substrate.value;
    this.ethereumDP = this.derivationPath.ethereum.value;
    this.substrateKeyPair = this.derivationPath.substrate.keyPair || 'sr25519';
    this.ethereumKeyPair = this.derivationPath.ethereum.keyPair || 'ecdsa';
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
        keyPair: this.ethereumKeyPair as KeypairType,
      },
    };

    this.$emit('saveChanges', derivationPath, 'derivationPath');
    this.closeAdvancedForm();
  }
}
</script>

<style lang="scss" scoped>
.advanced {
  .input {
    width: 528px;
    font-size: 24px;
    margin-top: 16px;
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
