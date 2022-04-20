<template>
  <div class="import-wallet">
    <div class="row import" @click="openPopup">
      <s-input :value="typeImportLabel" placeholder="Source type" class="import" size="big" readonly />
    </div>

    <s-input
      v-if="notJsonImport"
      v-model="inputValue"
      :placeholder="placeholderTypeImportValue"
      class="row input"
      type="textarea"
      maxlength="130"
    />
    <template v-else>
      <div class="row">
        <s-input
          v-model="inputValue"
          :placeholder="placeholderTypeImportValue"
          size="big"
          type="text-file"
          accept="application/JSON"
          readonly
        />
        <s-input v-model="_passwordJson" placeholder="Password" size="big" show-password class="row" />
      </div>
    </template>

    <slot v-if="notJsonImport"></slot>

    <PopupWithSelect
      v-if="showPopup"
      v-model="typeImport"
      header="Source type"
      :toggleValue="toggleTypeImport"
      :handlerClose="closePopup"
      :options="optionsImport"
    />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, Watch, VModel } from 'vue-property-decorator';
import { TypeFiledForImport, DerivationPath } from '../../interfaces/connectionWallet';
import PopupWithSelect from '../../components/PopupWithSelect.vue';

@Component({
  components: { PopupWithSelect },
})
export default class extends Vue {
  readonly optionsImport = [
    { label: 'Mnemonic passphrase', value: 'mnemonic', placeholder: 'Enter Passphrase' },
    { label: 'Restore JSON', value: 'json', placeholder: 'Restore JSON' },
    { label: 'Raw seed', value: 'rawSeed', placeholder: 'Raw seed' },
  ];

  showPopup = false;
  fileJson = '';

  @VModel({ type: String }) typeImport!: TypeFiledForImport;
  @Prop(String) mnemonic!: string;
  @Prop(String) rawSeed!: string;
  @Prop(String) json!: string;
  @Prop(String) passwordJson!: string;
  @Prop(Object) derivationPath!: DerivationPath;

  get typeImportLabel() {
    return this.optionsImport.find(({ value }) => value === this.typeImport)?.label;
  }

  get inputValue() {
    return this[this.typeImport];
  }

  set inputValue(value: string) {
    this.$emit('setValue', value, this.typeImport);
  }

  get _passwordJson() {
    return this.passwordJson;
  }

  set _passwordJson(value: string) {
    this.$emit('setValue', value, 'passwordJson');
  }

  get mnemonicArray() {
    return this.mnemonic.split(' ');
  }

  get notJsonImport() {
    return this.typeImport !== 'json';
  }

  get placeholderTypeImportValue() {
    return this.optionsImport.find(({ value }) => value === this.typeImport)?.placeholder;
  }

  @Watch('typeImport')
  onTypeImportChanged() {
    this.$emit('setValue', '', 'json');
    this.$emit('setValue', '', 'rawSeed');
    this.$emit('setValue', '', 'mnemonic');
    this.$emit('setValue', '', 'passwordJson');
  }

  typeImportClasses(value: string) {
    return [
      'type-import',
      {
        'active-type-import': this.typeImport === value,
      },
    ];
  }

  toggleTypeImport(value: TypeFiledForImport) {
    this.typeImport = value;

    this.closePopup();
  }

  closePopup() {
    this.showPopup = false;
  }

  openPopup() {
    this.showPopup = true;
  }
}
</script>

<style lang="scss">
.s-icon-file-file-upload-24::before {
  color: rgba(255, 255, 255, 0.5);
}

.s-textarea {
  padding: 20px 25px 25px !important;
}

.el-textarea__inner {
  height: 100px !important;
  resize: none !important;
}

.import {
  cursor: pointer;

  input:hover {
    cursor: pointer;
  }
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
    height: 170px;
  }

  .row {
    margin-top: 15px;

    &:first-child {
      margin-top: 0;
    }
  }

  .type-import {
    color: rgba(255, 255, 255, 0.75);
    margin: 8px 0;
    text-align: left;
    width: 100%;
    display: flex;
    justify-content: space-between;

    &:hover {
      cursor: pointer;
      color: #ffffff;
    }
  }

  i {
    color: var(--pink-lavender-color);
  }
}
</style>
