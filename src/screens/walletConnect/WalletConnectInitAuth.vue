<template>
  <AboveForm :fullScreen="true" :showBackIcon="false" @closeHandler="onBack">
    <div class="wc-init-form">
      <ValidatedInput
        :value="uri"
        :placeholder="$t('walletConnect.insertUrl')"
        :maxlength="500"
        size="big"
        :isError="isError"
        :errorDescriptions="$t(errorDescriptions)"
        :errorWithIcon="true"
        @change="changeUri"
      />

      <FButton text="common.connect" size="big" fontSize="big" :disabled="isError" :border="false" @click="onSubmit" />
    </div>
  </AboveForm>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router/composables';
import { getClipboard } from '@/helpers';
import { newConnection } from '@/extension/messaging';

const router = useRouter();
const uri = ref('');
const isError = ref(false);
const errorDescriptions = ref('');

watch(uri, () => {
  if (uri.value === '') isError.value = false;
});

onMounted(() => {
  const clipboard = getClipboard();

  if (clipboard.startsWith('wc:')) uri.value = clipboard;
});

const changeUri = (value: string) => {
  uri.value = value;
};

const onSubmit = async () => {
  const result = await newConnection({ uri: uri.value });

  if (!(typeof result === 'boolean')) {
    isError.value = true;
    errorDescriptions.value = result.message;
  }
};

const onBack = () => router.back();
</script>

<style lang="scss" scoped>
.wc-init-form {
  display: flex;
  justify-content: space-between;
  flex-direction: column;
  height: 100%;
}
</style>
