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
    <div class="example-prompt">Example: {{ example }}</div>
    <div v-if="showEthereumDP">
      <s-input value="ETHEREUM" type="text" placeholder="ETHEREUM KEYPAIR CRYPTO TYPE" :readonly="true" class="input" />
      <s-input
        v-model="ethereumDP"
        type="text"
        placeholder="Ethereum secret derivation path"
        maxlength="25"
        class="input"
      />
      <div class="example-prompt">Example: m/44'/60'/0'/0/0</div>
    </div>
  </AboveForm>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { DerivationPath } from '../../interfaces/connectionWallet';
import type { KeypairType } from '@polkadot/util-crypto/types';
import AboveForm from '../../components/AboveForm.vue';

@Component({
  components: { AboveForm },
})
export default class extends Vue {
  readonly optionsSubstrateKeyPair = [
    { label: 'Schnorrkel sr25519 (recommended)', value: 'sr25519', example: '//hard/soft///password' },
    { label: 'Edwards ed25519 (alternative)', value: 'ed25519', example: '//hard///password' },
    { label: 'ECDSA | BTC/ETH compatible', value: 'ecdsa', example: '//hard///password' },
  ];

  substrateDP = '';
  ethereumDP = '';
  substrateKeyPair = '';

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
