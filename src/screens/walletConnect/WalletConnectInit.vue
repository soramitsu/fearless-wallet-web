<template>
  <AboveForm :fullScreen="true" :showBackIcon="true" @closeHandler="onBack" @handlerBack="onBack">
    <div class="wc-init-form">
      <FInput v-model="uri" :placeholder="placeholder" size="big" />

      <FButton text="walletConnect.newConnection" size="big" fontSize="big" :border="false" @click="onSubmit" />
    </div>
  </AboveForm>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router/composables';
import { getClipboard } from '@/helpers';
import { newConnection } from '@/extension/messaging';

const router = useRouter();

const placeholder = 'insert wallet connect url';
const uri = ref('');

onMounted(() => {
  const clipboard = getClipboard();

  if (clipboard.startsWith('wc:')) uri.value = clipboard;
});

const onSubmit = () => newConnection({ uri: uri.value });

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
