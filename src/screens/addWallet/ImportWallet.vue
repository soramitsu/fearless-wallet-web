<template>
  <div class="import-wallet">
    <Select
      v-model="typeImport"
      placeholder="common.sourceType"
      size="big"
      class="row"
      :options="optionsImport"
      :disabled="disabledSelect"
    />

    <template v-if="isJsonImport">
      <div class="row">
        <Input
          v-model="inputValue"
          type="text-file"
          size="big"
          accept="application/JSON"
          :placeholder="placeholderTypeImportValue"
          :readonly="true"
        />

        <Input v-model="syncedPasswordJson" size="big" placeholder="common.password" class="row" :showPassword="true" />
      </div>
    </template>

    <Input
      v-else
      v-model="inputValue"
      type="textarea"
      class="row"
      size="big"
      :placeholder="placeholderTypeImportValue"
      :maxlength="130"
      :height="170"
    />

    <slot v-if="showSlot"></slot>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, Watch, VModel, PropSync } from 'vue-property-decorator';
import type { ImportType } from '@/interfaces';

@Component
export default class ImportWallet extends Vue {
  readonly optionsImport = [
    { label: 'Mnemonic passphrase', value: 'mnemonic' },
    { label: 'Raw seed', value: 'rawSeed' },
    { label: 'Restore JSON', value: 'json' },
  ];

  @VModel({ type: String }) typeImport!: ImportType;
  @Prop(String) mnemonic!: string;
  @Prop(String) substrateRawSeed!: string;
  @Prop(String) ethereumRawSeed!: string;
  @Prop(String) substrateJson!: string;
  @Prop(String) ethereumJson!: string;
  @Prop(Number) step!: number;
  @Prop(Boolean) isOnlyEthereumAccountFlow!: boolean;
  @PropSync('passwordJson', { type: String }) syncedPasswordJson!: string;

  get inputValue() {
    return this[this.field];
  }

  set inputValue(value: string) {
    this.$emit('setImportValue', value, this.field);
  }

  get field() {
    if (this.typeImport === 'mnemonic') return 'mnemonic';

    if (this.typeImport === 'rawSeed') {
      if (this.isOnlyEthereumAccountFlow) {
        return 'ethereumRawSeed';
      }

      return this.step === 1 ? 'substrateRawSeed' : 'ethereumRawSeed';
    }

    // typeImport === 'json'
    if (this.isOnlyEthereumAccountFlow) {
      return 'ethereumJson';
    }

    return this.step === 1 ? 'substrateJson' : 'ethereumJson';
  }

  get disabledSelect() {
    return this.step === 2;
  }

  get notJsonImport() {
    return this.typeImport !== 'json';
  }

  get showSlot() {
    return this.typeImport === 'mnemonic' || (this.typeImport === 'rawSeed' && this.step === 1);
  }

  get placeholderTypeImportValue() {
    if (this.typeImport === 'rawSeed') {
      if (this.isOnlyEthereumAccountFlow) {
        return this.t('rawSeed', { type: 'ETH' });
      }

      if (this.step === 1) return this.t('rawSeed', { type: 'Substrate' });

      if (this.step === 2) return this.t('rawSeed', { type: 'ETH' });
    }

    if (this.typeImport === 'json') {
      if (this.step === 1) return this.t('restoreJson', { type: 'Substrate' });

      if (this.step === 2) return this.t('restoreJson', { type: 'Ethereum' });
    }

    return this.t('enterPassphrase');
  }

  @Watch('typeImport')
  onTypeImportChanged() {
    this.$emit('reset');
  }

  t(value: string, obj: Record<string, string> = {}) {
    return this.$t(`addWallet.${value}`, obj);
  }
}
</script>

<style lang="scss">
.s-icon-file-file-upload-24::before {
  color: $gray-color;
}

.s-textarea {
  padding: 20px 25px 25px !important;
}

.el-textarea__inner {
  height: 100px !important;
  resize: none !important;
}
</style>

<style lang="scss" scoped>
.import-wallet {
  display: flex;
  flex-direction: column;
  width: 100%;

  .s-icon-file-file-upload-24 {
    color: #ccd2e3 !important;
  }

  .row {
    margin-top: 15px;

    &:first-child {
      margin-top: 0;
    }
  }

  i {
    color: $pink-lavender-color;
  }
}
</style>
