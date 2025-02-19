<template>
  <AboveForm
    header="addWallet.advanced"
    :showAcceptIcon="showAcceptIcon"
    :fullScreen="true"
    @closeHandler="closeAdvancedForm"
    @saveChanges="saveChanges"
  >
    <FSelect
      :value="substrateKeypairType"
      :options="optionsSubstrateKeyPair"
      placeholder="addWallet.substrateCryptoType"
      size="big"
      class="row"
      @change="changeSubstrateKeypairType"
    />

    <FInput
      :value="substrateDP"
      class="row"
      placeholder="addWallet.substrateDP"
      size="big"
      data-testid="substrateDP"
      @change="changeSubstrateDP"
    />

    <div class="example-prompt">{{ $t('addWallet.example', { example }) }}</div>

    <template v-if="showEthereumDP">
      <FInput
        :value="ethereumKeypairType"
        class="row"
        placeholder="addWallet.ethereumCryptoType"
        :readonly="true"
        size="big"
      />

      <FInput
        :value="ethereumDP"
        class="row"
        placeholder="addWallet.ethereumDP"
        :maxlength="25"
        size="big"
        data-testid="ethereumDP"
        @change="changeEthereumDP"
      />

      <div class="example-prompt">{{ $t('addWallet.example', { example: ethereumDefaultDerivationPath }) }}</div>
    </template>
  </AboveForm>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import type { DerivationPaths } from '@/interfaces';
import type { KeypairType } from '@polkadot/util-crypto/types';
import { ETHEREUM_DEFAULT_DERIVATION_PATH } from '@/consts/derivationPath';

@Component
export default class AdvancedForm extends Vue {
  readonly ethereumDefaultDerivationPath = ETHEREUM_DEFAULT_DERIVATION_PATH;
  readonly optionsSubstrateKeyPair = [
    { label: 'Schnorrkel sr25519 (recommended)', value: 'sr25519', example: '//hard/soft///password' },
    { label: 'Edwards ed25519 (alternative)', value: 'ed25519', example: '//hard///password' },
    { label: 'ECDSA | BTC/ETH compatible', value: 'ecdsa', example: '//hard///password' },
  ];

  substrateDP = '';
  ethereumDP = '';
  substrateKeypairType = '';
  ethereumKeypairType = 'ETHEREUM';

  @Prop(Object) derivationPaths!: DerivationPaths;
  @Prop({ default: true }) showEthereumDP!: boolean;

  get example() {
    return this.optionsSubstrateKeyPair.find(({ value }) => value === this.substrateKeypairType)?.example;
  }

  get showAcceptIcon() {
    const { ethereum, substrate } = this.derivationPaths;
    const isSubstrateSaved = substrate.value !== '';
    const isEthereumSaved = ethereum.value !== '';

    if (isSubstrateSaved && isEthereumSaved) {
      return this.substrateDP !== substrate.value || this.ethereumDP !== ethereum.value;
    }

    if (isSubstrateSaved && ethereum.value === '') {
      return this.substrateDP !== substrate.value || this.ethereumDP !== '';
    }

    if (isEthereumSaved && substrate.value === '') {
      return this.ethereumDP !== ethereum.value || this.substrateDP !== '';
    }

    return this.substrateDP !== '' || this.ethereumDP !== '';
  }

  changeSubstrateKeypairType(value: string) {
    this.substrateKeypairType = value;
  }

  mounted() {
    this.substrateDP = this.derivationPaths.substrate.value;
    this.ethereumDP = this.derivationPaths.ethereum.value;
    this.substrateKeypairType = this.derivationPaths.substrate.keypairType;
  }

  closeAdvancedForm() {
    this.$emit('toggleAdvancedFormVisible', false);
  }

  changeSubstrateDP(value: string) {
    this.substrateDP = value;
  }

  changeEthereumDP(value: string) {
    this.ethereumDP = value;
  }

  saveChanges() {
    const derivationPaths: DerivationPaths = {
      substrate: {
        value: this.substrateDP,
        keypairType: this.substrateKeypairType as KeypairType,
      },
      ethereum: {
        value: this.ethereumDP,
        keypairType: 'ethereum',
      },
    };

    this.$emit('updateDP', derivationPaths);
    this.closeAdvancedForm();
  }
}
</script>

<style lang="scss" scoped>
.row {
  margin-top: 16px;

  &:first-child {
    margin-top: 0;
  }
}

.example-prompt {
  color: $grayish-white;
  font-size: 0.875em;
  text-align: left;
  line-height: 180%;
  margin: 16px 0;
}
</style>
