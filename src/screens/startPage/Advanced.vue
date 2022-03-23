<template>
  <div class="advanced">
    <s-collapse :accordion="false" :borders="false" style="flex: 1">
      <s-collapse-item title="Advanced" name="1">
        <s-select v-model="substrateKeyPair" class="row" size="medium">
          <s-option
            v-for="option in optionsSubstrateKeyPair"
            :key="option.value"
            :value="option.value"
            :label="option.label"
          />
        </s-select>
        <s-input
          :value="substrateSecretDerivationPath"
          type="text"
          size="medium"
          placeholder="Substrate secret derivation path"
          maxlength="25"
          class="row"
          @input="onChangeSubstrateSecretDerivationPath"
        />
        <s-select v-model="ethereumKeyPair" class="row" size="medium">
          <s-option
            v-for="option in optionsEthereumKeyPair"
            :key="option.value"
            :value="option.value"
            :label="option.label"
          />
        </s-select>
        <s-input
          :value="ethereumSecretDerivationPath"
          type="text"
          size="medium"
          placeholder="Ethereum secret derivation path"
          maxlength="25"
          class="row"
          @input="onChangeEthereumSecretDerivationPath"
        />
      </s-collapse-item>
    </s-collapse>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component({
  components: {},
})
export default class extends Vue {
  @Prop(String) substrateSecretDerivationPath!: string;
  @Prop(String) ethereumSecretDerivationPath!: string;

  substrateKeyPair = 'sr25519';
  optionsSubstrateKeyPair = [{ label: 'Schnorrkel | sr25519', value: 'sr25519' }];
  ethereumKeyPair = 'ECDSA';
  optionsEthereumKeyPair = [{ label: 'ECDSA | BTC/ETH compatible', value: 'ECDSA' }];

  onChangeSubstrateSecretDerivationPath(value: string) {
    this.$emit('updatedDerivationPath', value, 'substrateSecretDerivationPath');
  }

  onChangeEthereumSecretDerivationPath(value: string) {
    this.$emit('updatedDerivationPath', value, 'ethereumSecretDerivationPath');
  }
}
</script>

<style lang="scss" scoped>
.advanced {
  .el-collapse-item__header {
    color: white;
  }

  .row {
    margin-top: 5px;

    &:first-child {
      margin-top: 0;
    }
  }
}
</style>
