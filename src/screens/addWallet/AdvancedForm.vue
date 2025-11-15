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

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import type { DerivationPaths } from '@/interfaces';
import type { KeypairType } from '@polkadot/util-crypto/types';
import { ETHEREUM_DEFAULT_DERIVATION_PATH } from '@/consts/derivationPath';

defineOptions({
  name: 'AdvancedForm',
});

const props = withDefaults(
  defineProps<{
    derivationPaths: DerivationPaths;
    showEthereumDP?: boolean;
  }>(),
  {
    showEthereumDP: true,
  }
);

const emit = defineEmits<{
  toggleAdvancedFormVisible: [value: boolean];
  updateDP: [value: DerivationPaths];
}>();

const ethereumDefaultDerivationPath = ETHEREUM_DEFAULT_DERIVATION_PATH;
const optionsSubstrateKeyPair = [
  { label: 'Schnorrkel sr25519 (recommended)', value: 'sr25519', example: '//hard/soft///password' },
  { label: 'Edwards ed25519 (alternative)', value: 'ed25519', example: '//hard///password' },
  { label: 'ECDSA | BTC/ETH compatible', value: 'ecdsa', example: '//hard///password' },
] as const;

const substrateDP = ref('');
const ethereumDP = ref('');
const substrateKeypairType = ref<KeypairType | ''>('');
const ethereumKeypairType = ref('ETHEREUM');

const initialize = () => {
  substrateDP.value = props.derivationPaths.substrate.value;
  ethereumDP.value = props.derivationPaths.ethereum.value;
  substrateKeypairType.value = props.derivationPaths.substrate.keypairType;
};

watch(
  () => props.derivationPaths,
  () => initialize(),
  { immediate: true, deep: true }
);

const example = computed(
  () => optionsSubstrateKeyPair.find(({ value }) => value === substrateKeypairType.value)?.example
);

const showAcceptIcon = computed(() => {
  const { ethereum, substrate } = props.derivationPaths;
  const isSubstrateSaved = substrate.value !== '';
  const isEthereumSaved = ethereum.value !== '';

  if (isSubstrateSaved && isEthereumSaved) {
    return substrateDP.value !== substrate.value || ethereumDP.value !== ethereum.value;
  }

  if (isSubstrateSaved && ethereum.value === '') {
    return substrateDP.value !== substrate.value || ethereumDP.value !== '';
  }

  if (isEthereumSaved && substrate.value === '') {
    return ethereumDP.value !== ethereum.value || substrateDP.value !== '';
  }

  return substrateDP.value !== '' || ethereumDP.value !== '';
});

const changeSubstrateKeypairType = (value: string) => {
  substrateKeypairType.value = value as KeypairType;
};

const changeSubstrateDP = (value: string) => {
  substrateDP.value = value;
};

const changeEthereumDP = (value: string) => {
  ethereumDP.value = value;
};

const closeAdvancedForm = () => {
  emit('toggleAdvancedFormVisible', false);
};

const saveChanges = () => {
  const derivationPaths: DerivationPaths = {
    substrate: {
      value: substrateDP.value,
      keypairType: substrateKeypairType.value as KeypairType,
    },
    ethereum: {
      value: ethereumDP.value,
      keypairType: 'ethereum',
    },
  };

  emit('updateDP', derivationPaths);
  closeAdvancedForm();
};
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
