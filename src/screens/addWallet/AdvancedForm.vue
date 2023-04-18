<template>
  <AboveForm
    header="addWallet.advanced"
    :showAcceptIcon="showAcceptIcon"
    :closeHandler="closeAdvancedForm"
    :saveChanges="saveChanges"
  >
    <template v-if="showSubstrateDP">
      <Select
        v-model="substrateKeypairType"
        :options="optionsSubstrateKeyPair"
        placeholder="addWallet.substrateCryptoType"
        size="big"
        class="row"
      />

      <Input v-model="substrateDP" class="row" placeholder="addWallet.substrateDP" size="big" />

      <div class="example-prompt">{{ $t('addWallet.example', { example }) }}</div>
    </template>

    <template v-if="showEthereumDP">
      <Input
        v-model="ethereumKeypairType"
        class="row"
        placeholder="addWallet.ethereumCryptoType"
        :readonly="true"
        size="big"
      />

      <Input v-model="ethereumDP" class="row" placeholder="addWallet.ethereumDP" :maxlength="25" size="big" />

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
  @Prop({ default: true }) showSubstrateDP!: boolean;

  get example() {
    return this.optionsSubstrateKeyPair.find(({ value }) => value === this.substrateKeypairType)?.example;
  }

  get showAcceptIcon() {
    return !!this.substrateDP || !!this.ethereumDP;
  }

  mounted() {
    this.substrateDP = this.derivationPaths.substrate.value;
    this.ethereumDP = this.derivationPaths.ethereum.value;
    this.substrateKeypairType = this.derivationPaths.substrate.keypairType;
  }

  closeAdvancedForm() {
    this.$emit('toggleAdvancedFormVisible', false);
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
  font-size: 14px;
  text-align: left;
  line-height: 180%;
  margin: 16px 0;
}
</style>
