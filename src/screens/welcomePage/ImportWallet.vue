<template>
  <div class="import-wallet">
    <s-select v-model="typeImport" class="row" size="medium">
      <s-option v-for="option in optionsImport" :key="option.value" :value="option.value" :label="option.label" />
    </s-select>

    <NicknameForm class="row" />

    <template v-if="!importJson">
      <s-input class="row input" :value="inputValue" type="text" :placeholder="placeholder" @input="onChange" />
    </template>
    <template v-else>
      <div class="row">
        <s-input
          :value="jsonValue"
          placeholder="Restore JSON"
          size="big"
          type="text-file"
          accept="application/JSON"
          readonly
          @input="onChange"
        />
        <s-input
          :value="passwordJson"
          placeholder="Password"
          size="big"
          show-password
          class="row"
          @input="onChangePassword"
        />
      </div>
    </template>

    <AdvancedButton v-if="!importJson" :handler="toggleAdvancedFormVisible" />

    <AdvancedForm
      v-if="showAdvancedForm"
      :derivationPath="derivationPath"
      :showEthereumDP="showEthereumDP"
      @saveChanges="setValue"
      @toggleAdvancedFormVisible="toggleAdvancedFormVisible"
    />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, Watch } from 'vue-property-decorator';
import { TypeFiledForImport, DerivationPath } from '../../interfaces/connectionWallet';
import NicknameForm from './NicknameForm.vue';
import AdvancedButton from './AdvancedButton.vue';
import AdvancedForm from './AdvancedForm.vue';

@Component({
  components: {
    NicknameForm,
    AdvancedButton,
    AdvancedForm,
  },
})
export default class extends Vue {
  fileJson = '';
  showAdvancedForm = false;
  typeImport: TypeFiledForImport = 'mnemonic';
  optionsImport = [
    { label: 'Mnemonic passphrase', value: 'mnemonic' },
    { label: 'Restore JSON', value: 'json' },
    { label: 'Raw seed', value: 'rawSeed' },
  ];

  @Prop(String) mnemonic!: string;
  @Prop(String) rawSeed!: string;
  @Prop(Object) json!: string;
  @Prop(String) passwordJson!: string;
  @Prop(Object) derivationPath!: DerivationPath;

  get showEthereumDP() {
    return this.typeImport !== 'rawSeed';
  }

  get jsonValue() {
    return JSON.stringify(this.json);
  }

  get inputValue() {
    return this[this.typeImport];
  }

  get mnemonicArray() {
    return this.mnemonic.split(' ');
  }

  get importJson() {
    return this.typeImport === 'json';
  }

  get placeholder() {
    if (this.typeImport === 'mnemonic') {
      return 'Mnemonic passphrase';
    } else if (this.typeImport === 'rawSeed') {
      return 'Raw seed';
    }

    return 'json';
  }

  @Watch('typeImport')
  onTypeImportChanged() {
    this.$emit('setValue', {}, 'json');
    this.$emit('setValue', '', 'rawSeed');
    this.$emit('setValue', '', 'mnemonic');
    this.$emit('setValue', '', 'passwordJson');
  }

  toggleAdvancedFormVisible(value = true) {
    this.showAdvancedForm = value;
  }

  onChange(string: string) {
    const value = this.typeImport === 'json' ? JSON.parse(string) : string;

    this.$emit('setValue', value, this.typeImport);
  }

  onChangePassword(value: string) {
    this.$emit('setValue', value, 'passwordJson');
  }

  setValue(value: DerivationPath) {
    this.$emit('setValue', value, 'derivationPath');

    this.toggleAdvancedFormVisible(false);
  }
}
</script>

<style lang="scss">
.s-icon-file-file-upload-24::before {
  color: rgba(255, 255, 255, 0.5);
}
</style>

<style lang="scss" scoped>
.import-wallet {
  display: flex;
  flex-direction: column;

  .s-icon-file-file-upload-24 {
    color: #ccd2e3 !important;
  }

  .input {
    height: 135px;
  }

  .row {
    margin-top: 15px;

    &:first-child {
      margin-top: 0;
    }
  }
}
</style>
