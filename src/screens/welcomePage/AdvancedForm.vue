<template>
  <div class="advanced">
    <div class="header">
      <div class="header-content">
        <div class="logo">
          <img src="../../assets/fw-logo.svg" />
        </div>
        <div>Advanced</div>
        <div class="active-block">
          <div class="icon" @click="closeAdvancedForm">
            <s-icon name="basic-close-24" class="default-close" />
          </div>
          <div v-show="showAcceptIcon" class="icon" @click="saveChanges">
            <s-icon name="basic-check-mark-24" />
          </div>
        </div>
      </div>
    </div>
    <div class="content">
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
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { DerivationPath } from '../../interfaces/connectionWallet';
import type { KeypairType } from '@polkadot/util-crypto/types';

@Component({
  components: {},
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
    return this.substrateDP || this.ethereumDP;
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
  height: 560px;
  width: 100%;
  background-color: #111111;
  clip-path: polygon(100% 0, 100% 100%, 0 100%, 0 4%, 4% 0);
  border-radius: 8px;
  z-index: 99;
  animation: ani 0.3s;

  @keyframes ani {
    0% {
      opacity: 0;
    }
    100% {
      opacity: 1;
    }
  }

  .default-close {
    color: rgba(255, 255, 255, 0.65);
  }

  .s-icon-basic-close-24 {
    font-weight: 400;
    // font-size: 20px !important;
    opacity: 0.8;

    &:hover {
      cursor: pointer;
      opacity: 1;
    }
  }

  .s-icon-basic-check-mark-24 {
    color: rgba(255, 255, 255, 0.5);
    font-weight: 400;
    // font-size: 20px !important;
    color: #bb77ff;
    opacity: 0.8;

    &:hover {
      cursor: pointer;
      opacity: 1;
    }
  }

  .header {
    font-size: 24px;
    height: 64px;
  }

  .header-content {
    display: flex;
    justify-content: space-between;
    padding: 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .content {
    padding: 0 16px;
  }

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

  .logo {
    margin-left: 5px;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .active-block {
    display: flex;
    justify-content: right;
    width: 10px;
  }

  .icon {
    display: flex;
    flex-direction: column;
    justify-content: center;

    &:last-child {
      margin-left: 15px;
    }
  }
}
</style>
