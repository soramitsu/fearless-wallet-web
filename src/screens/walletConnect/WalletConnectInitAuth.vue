<template>
  <AboveForm :fullScreen="true" :showBackIcon="false" @closeHandler="onBack">
    <div class="wc-init-form">
      <ValidatedInput
        v-model="uri"
        :placeholder="$t('walletConnect.insertUrl')"
        size="big"
        :isError="isError"
        :errorDescriptions="$t('walletConnect.pairingErrorMessage')"
      />

      <FButton text="walletConnect.connect" size="big" fontSize="big" :border="false" @click="onSubmit" />
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

watch(uri, () => {
  if (uri.value === '') isError.value = false;
});

onMounted(() => {
  const clipboard = getClipboard();

  if (clipboard.startsWith('wc:')) uri.value = clipboard;
});

const onSubmit = async () => {
  const result = await newConnection({ uri: uri.value });

  if (!result) isError.value = true;
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
