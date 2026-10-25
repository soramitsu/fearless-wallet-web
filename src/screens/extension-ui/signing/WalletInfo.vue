<template>
  <div class="signing-wallet">
    <div class="signing-wallet__identity">
      <p v-if="name" class="signing-wallet__name">{{ name }}</p>
      <p class="signing-wallet__address" dir="ltr">{{ address }}</p>
      <p v-if="copyError" role="alert">{{ t('addWallet.google.somethingWrong') }}</p>
    </div>
    <button type="button" :aria-label="t('accounts.copyAddress')" @click="copyAddress">
      <Icon icon="clipboard" :hover="false" />
    </button>
  </div>
</template>
<script lang="ts" setup>
import { ref } from 'vue';
import { useI18n } from '@/locales/useI18n';
const props = defineProps<{ address: string; name: string }>();
const { t } = useI18n();
const copyError = ref(false);
const copyAddress = async () => {
  copyError.value = false;
  try {
    await navigator.clipboard.writeText(props.address);
  } catch {
    copyError.value = true;
  }
};
</script>
<style lang="scss" scoped>
.signing-wallet {
  display: flex;
  gap: 12px;
  align-items: start;
}
.signing-wallet__identity {
  min-width: 0;
  flex: 1;
  p {
    margin: 0 0 8px;
    overflow-wrap: anywhere;
  }
}
.signing-wallet__name {
  font-weight: 700;
}
.signing-wallet__address {
  font-family: var(--fw-font-mono);
  unicode-bidi: isolate;
}
button {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  border: 1px solid var(--fw-stroke-control);
  border-radius: 12px;
  background: var(--fw-sunken);
  color: var(--fw-text-1);
  cursor: pointer;
}
button:focus-visible {
  outline: 2px solid var(--fw-focus);
  outline-offset: 2px;
}
</style>
