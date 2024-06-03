<template>
  <div class="import-wallet">
    <FSelect
      :value="typeImport"
      placeholder="common.sourceType"
      size="big"
      class="row"
      :options="optionsImport"
      :disabled="disabledSelect"
      data-testid="sourceTypeSelect"
      @change="changeTypeImport"
    />

    <FInput
      v-if="notJsonImport"
      v-model="inputValue"
      ref="valueInput"
      type="textarea"
      class="row"
      size="big"
      :placeholder="placeholderTypeImportValue"
      :maxlength="130"
      :height="170"
      data-testid="textarea"
      @change="changeInputValue"
    />

    <template v-else>
      <div class="row">
        <FInput
          :value="inputValue"
          type="text-file"
          size="big"
          accept="application/JSON"
          :placeholder="placeholderTypeImportValue"
          :readonly="true"
          data-testid="textFile"
        />

        <FInput
          v-model="syncedPasswordJson"
          size="big"
          placeholder="common.password"
          class="row"
          :showPassword="true"
          data-testid="password"
          @change="changeSyncedPasswordJson"
        />
      </div>
    </template>

    <AdvancedButton v-if="showSlot" @click="toggleAdvancedFormVisible" />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, Watch, VModel, PropSync, Ref } from 'vue-property-decorator';
import type { ImportType } from '@/interfaces';
import type Input from '@/components/Input.vue';
import AdvancedButton from '@/screens/addWallet/AdvancedButton.vue';

@Component({
  components: {
    AdvancedButton,
  },
})
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
  @Prop(Boolean) isOnlyEthereumAccount!: boolean;
  @PropSync('passwordJson', { type: String }) syncedPasswordJson!: string;
  @Ref('valueInput') readonly valueInputComponent!: Input;

  get inputValue() {
    return this[this.field];
  }

  set inputValue(value: string) {
    this.$emit('setImportValue', value, this.field);
  }

  changeInputValue(value: string) {
    this.inputValue = value;
  }

  changeSyncedPasswordJson(value: string) {
    this.syncedPasswordJson = value;
  }

  get field() {
    if (this.typeImport === 'mnemonic') return 'mnemonic';

    if (this.typeImport === 'rawSeed') {
      if (this.isOnlyEthereumAccount) return 'ethereumRawSeed';

      return this.step === 1 ? 'substrateRawSeed' : 'ethereumRawSeed';
    }

    // typeImport === 'json'
    if (this.isOnlyEthereumAccount) return 'ethereumJson';

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
      if (this.isOnlyEthereumAccount) {
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

  changeTypeImport(value: ImportType) {
    this.typeImport = value;
  }

  @Watch('typeImport')
  onTypeImportChanged() {
    this.$emit('reset');
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    //@ts-ignore
    this.$nextTick(() => this.valueInputComponent?.input.focus());
  }

  mounted() {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    //@ts-ignore
    this.valueInputComponent.input.focus();
  }

  t(value: string, obj: Record<string, string> = {}) {
    return this.$t(`addWallet.${value}`, obj);
  }

  toggleAdvancedFormVisible() {
    this.$emit('toggleAdvancedFormVisible');
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
