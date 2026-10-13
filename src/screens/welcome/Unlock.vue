<template>
  <div class="unlock">
    <div>
      <div class="header">
        <CircleButton
          v-if="isPopup"
          iconName="expand"
          backgroundColor="light-black"
          tooltipText="common.fullScreen"
          target=".expand"
          placement="left"
          @click="openFullScreen"
        />
      </div>

      <div class="logo-container">
        <div class="logo-mark" role="img" :aria-label="t('common.fearlessLogo')">
          <img :src="sunColour" class="unlock-logo" alt="" />
        </div>

        <Logo
          class="description"
          size="big"
          text="common.fearlessWallet"
          :subtext="$t('welcome.deFiWallet')"
          :showLogo="false"
        />
      </div>
    </div>

    <div class="pass-block">
      <ValidatedInput
        size="big"
        placeholder="common.password"
        errorDescriptions="common.invalidPassword"
        :isError="isError"
        :showPassword="true"
        :readonly="isUnlocking"
        :value="password"
        @pressEnter="unlock"
        @change="changeSyncedPassword"
      />

      <FButton
        class="unlock-btn"
        text="welcome.unlock"
        size="big"
        :loading="isUnlocking"
        :border="false"
        @click="unlock"
      />

      <p class="unlock-error" role="alert" aria-live="polite" aria-atomic="true">{{ unlockFailed ? t('accountAccess.unlockFailed') : '' }}</p>
      <RecoveryDataLink />

      <div class="bottom">
        <button type="button" class="pink" data-testid="forgotPassword" :disabled="isUnlocking" @click="toggleResetPopup">
          {{ t('welcome.forgotYourPassword') }}
        </button>

        <div class="fearless-support">
          <span>{{ t('welcome.needHelp') }}</span>

          <a class="pink" data-testid="unlockSupport" :href="URLS.FEARLESS_HAPPINESS" target="_blank" rel="noopener noreferrer">
            {{ t('common.fearlessSupport') }}
          </a>
        </div>
      </div>
    </div>

    <ResetPopup v-if="showResetPopup" @close="toggleResetPopup" />
  </div>
</template>

<script lang="ts" setup>
import { watch, ref, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import sunColour from '@/assets/brand/winged-sun-colour.svg';
import { useI18n } from '@/locales/useI18n';
import { unlockExtension, windowOpen } from '@/extension/messaging';
import { Components } from '@/router/routes';
import { IS_POPUP } from '@/consts/globalClient';
import { URLS } from '@/consts/urls';
import ResetPopup from '@/screens/welcome/ResetPopup.vue';
import RecoveryDataLink from '@/components/RecoveryDataLink.vue';
import { resolveUnlockRedirect } from '@/router/unlockRedirect';

const router = useRouter();
const route = useRoute();
const password = ref('');
const isError = ref(false);
const showResetPopup = ref(false);
const isUnlocking = ref(false);
const unlockFailed = ref(false);
let disposed = false;
const isPopup = ref(IS_POPUP);
const { t } = useI18n();

watch(password, () => { isError.value = false; unlockFailed.value = false; });
onBeforeUnmount(() => { disposed = true; password.value = ''; });

const changeSyncedPassword = (pass: string) => (password.value = pass);

const unlock = async () => {
  if (isUnlocking.value || disposed) return;
  isUnlocking.value = true;
  isError.value = false;
  unlockFailed.value = false;

  try {
    const isUnlock = await unlockExtension({ password: password.value });
    if (disposed) return;
    if (isUnlock) {
      await router.push(resolveUnlockRedirect(route.query.redirect) ?? { name: Components.Wallet });
    } else {
      isError.value = true;
    }
  } catch {
    // Transport errors do not establish that the password was incorrect.
    if (!disposed) unlockFailed.value = true;
  } finally {
    isUnlocking.value = false;
  }
};

const openFullScreen = () => {
  windowOpen(resolveUnlockRedirect(route.query.redirect) ?? '/');
  window.close();
};

const toggleResetPopup = () => (showResetPopup.value = !showResetPopup.value);
</script>

<style lang="scss" scoped>
.unlock {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 100%;
  gap: 24px;
  padding-bottom: 8px;

  .header {
    display: flex;
    justify-content: flex-end;
  }

  .logo-container {
    display: flex;
    flex-direction: column;
  }

  .logo-mark {
    display: flex;
    justify-content: center;
    padding: 24px 0 8px;

    :deep(.unlock-logo) {
      width: 240px;
      max-width: 100%;
      height: auto;
    }
  }

  .description :deep(.text) { font-size: 1.75rem; }


  .pass-block {
    .unlock-btn {
      margin: 16px 0;
    }
  }

  .unlock-error {
    margin: 0 0 8px;
    color: var(--fw-text-1);
    overflow-wrap: anywhere;
    &:empty { display: none; }
  }

  .bottom {
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;

    .fearless-support {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      column-gap: 0.25em;
      font-size: 12px;
      color: $gray-color;
    }

    .pink {
      display: inline-flex;
      align-items: center;
      min-height: 48px;
      padding: 0;
      border: 0;
      background: transparent;
      font: inherit;
      text-align: start;
      text-decoration: none;
      color: palette($pink-color, var(--fw-link));
      cursor: pointer;
    }
  }
}
</style>
