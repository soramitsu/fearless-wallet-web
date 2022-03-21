<template>
  <div class="import-wallet">
    <s-select v-model="typeImport" class="row" size="medium">
      <s-option v-for="option in optionsImport" :key="option.value" :value="option.value" :label="option.label" />
    </s-select>

    <NicknameForm class="row" />

    <template v-if="!importJson">
      <div class="row">
        <s-input :value="inputValue" type="textarea" :placeholder="placeholder" @input="onChange" />
      </div>
    </template>
    <template v-else>
      <div class="row">
        <s-json-input :value="json ? json : {}" @input="onChange" />
      </div>
      <div class="row">
        <s-input
          :value="password"
          placeholder="password from json"
          size="medium"
          show-password
          @input="onChangePassword"
        />
      </div>
    </template>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, Watch } from 'vue-property-decorator';
import NicknameForm from '../NicknameForm.vue';
import { TypeFiledForImport } from '../../../interfaces/connectionWallet';

@Component({
  components: {
    NicknameForm,
  },
})
export default class extends Vue {
  typeImport: TypeFiledForImport = 'mnemonic';
  optionsImport = [
    { label: 'Mnemonic passphrase', value: 'mnemonic' },
    { label: 'Restore JSON', value: 'json' },
    { label: 'Raw seed', value: 'rawSeed' },
  ];

  @Prop(Object) json!: Record<string, string>;
  @Prop(String) password!: string;
  @Prop(Number) currentIndexPage!: number;
  @Prop(String) mnemonic!: string;
  @Prop(String) rawSeed!: string;

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
  onTypeImportChanged(value: string) {
    if (value === 'mnemonic') {
      this.$emit('setValue', {}, 'json');
      this.$emit('setValue', '', 'rawSeed');
    } else if (value === 'json') {
      this.$emit('setValue', '', 'mnemonic');
      this.$emit('setValue', '', 'rawSeed');
    } else if (value === 'rawSeed') {
      this.$emit('setValue', '', 'mnemonic');
      this.$emit('setValue', {}, 'json');
    }
  }

  onChange(value: string) {
    this.$emit('setValue', value, this.typeImport);
  }

  onChangePassword(value: string) {
    this.$emit('setValue', value, 'password');
  }
}
</script>

<style lang="scss" scoped>
.import-wallet {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  height: 400px;

  .row {
    margin-top: 15px;

    &:first-child {
      margin-top: 0;
    }
  }
}
</style>
