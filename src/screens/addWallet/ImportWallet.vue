<template>
  <div class="import-wallet">
    <FInput
      v-if="!isSubstrate"
      :placeholder="placeholderTypeImportValue"
      :value="typeImportValue"
      :readonly="true"
      size="big"
    />

    <FSelect
      v-else
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
      ref="valueInputComponent"
      type="textarea"
      class="row"
      size="big"
      data-testid="textarea"
      :placeholder="placeholderTypeImportValue"
      :maxlength="200"
      :height="170"
      :value="inputValue"
      @change="changeInputValue"
    />

    <template v-else>
      <div class="row">
        <FInput
          data-testid="textFile"
          type="text-file"
          size="big"
          accept="application/JSON"
          :placeholder="placeholderTypeImportValue"
          :readonly="true"
          :value="inputValue"
          @change="changeInputValue"
        />

        <FInput
          size="big"
          placeholder="common.password"
          class="row"
          data-testid="password"
          :showPassword="true"
          :value="passwordJson"
          @change="changeSyncedPasswordJson"
        />
      </div>
    </template>

    <AdvancedButton v-if="showSlot" @click="toggleAdvancedFormVisible" />
  </div>
</template>

<script lang="ts" setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ImportType } from '@/interfaces';
import FInput from '@/components/FInput.vue';
import AdvancedButton from '@/screens/addWallet/AdvancedButton.vue';

defineOptions({
  name: 'ImportWallet',
});

type ImportField = 'mnemonic' | 'substrateRawSeed' | 'ethereumRawSeed' | 'substrateJson' | 'ethereumJson';

const optionsImport = [
  { label: 'Mnemonic passphrase', value: 'mnemonic' },
  { label: 'Raw seed', value: 'rawSeed' },
  { label: 'Restore JSON', value: 'json' },
] as const;

const props = withDefaults(
  defineProps<{
    typeImport: ImportType;
    mnemonic: string;
    substrateRawSeed: string;
    ethereumRawSeed: string;
    substrateJson: string;
    ethereumJson: string;
    step: number;
    isOnlyEthereumAccount: boolean;
    isSubstrate: boolean;
    passwordJson: string;
  }>(),
  {
    mnemonic: '',
    substrateRawSeed: '',
    ethereumRawSeed: '',
    substrateJson: '',
    ethereumJson: '',
    step: 1,
    isOnlyEthereumAccount: false,
    isSubstrate: true,
    passwordJson: '',
  }
);

const emit = defineEmits<{
  'update:typeImport': [value: ImportType];
  setImportValue: [value: string, field: ImportField];
  toggleAdvancedFormVisible: [];
  reset: [];
  'update:passwordJson': [value: string];
}>();

const { t } = useI18n();

const valueInputComponent = ref<InstanceType<typeof FInput> | null>(null);

const typeImport = computed({
  get: () => props.typeImport,
  set: (value: ImportType) => emit('update:typeImport', value),
});

const passwordJson = computed({
  get: () => props.passwordJson,
  set: (value: string) => emit('update:passwordJson', value),
});

const field = computed<ImportField>(() => {
  if (typeImport.value === 'mnemonic') return 'mnemonic';

  if (typeImport.value === 'rawSeed') {
    if (props.isOnlyEthereumAccount) return 'ethereumRawSeed';

    return props.step === 1 ? 'substrateRawSeed' : 'ethereumRawSeed';
  }

  // json
  if (props.isOnlyEthereumAccount) return 'ethereumJson';

  return props.step === 1 ? 'substrateJson' : 'ethereumJson';
});

const inputValue = computed({
  get: () => (props as Record<string, string>)[field.value],
  set: (value: string) => emit('setImportValue', value, field.value),
});

const typeImportValue = computed(() => optionsImport.find(({ value }) => value === typeImport.value)?.label ?? '');
const disabledSelect = computed(() => props.step === 2);
const notJsonImport = computed(() => typeImport.value !== 'json');

const showSlot = computed(() => {
  if (!props.isSubstrate) return false;

  return typeImport.value === 'mnemonic' || (typeImport.value === 'rawSeed' && props.step === 1);
});

const placeholderTypeImportValue = computed(() => {
  if (typeImport.value === 'rawSeed') {
    if (props.isOnlyEthereumAccount) {
      return t('addWallet.rawSeed', { type: 'ETH' });
    }

    if (props.step === 1) return t('addWallet.rawSeed', { type: 'Substrate' });

    if (props.step === 2) return t('addWallet.rawSeed', { type: 'ETH' });
  }

  if (typeImport.value === 'json') {
    if (props.step === 1) return t('addWallet.restoreJson', { type: 'Substrate' });

    if (props.step === 2) return t('addWallet.restoreJson', { type: 'Ethereum' });
  }

  return t('addWallet.enterPassphrase');
});

const toggleAdvancedFormVisible = () => {
  emit('toggleAdvancedFormVisible');
};

const changeInputValue = (value: string) => {
  inputValue.value = value;
};

const changeSyncedPasswordJson = (value: string) => {
  passwordJson.value = value;
};

const changeTypeImport = (value: ImportType) => {
  typeImport.value = value;
};

watch(
  typeImport,
  async () => {
    emit('reset');
    await nextTick();
    valueInputComponent.value?.input?.focus?.();
  },
  { flush: 'post' }
);

onMounted(async () => {
  await nextTick();
  valueInputComponent.value?.input?.focus?.();
});
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
