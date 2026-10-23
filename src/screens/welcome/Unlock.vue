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
        <img class="logo-animated" src="@/assets/fearless-logo-animated.gif" :alt="t('common.fearlessLogo')" />

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
      <div v-if="tonRecoveryNotice" class="recovery-notice" role="alert">
        <p>{{ t(tonRecoveryNotice === 'ton-storage-unavailable' ? 'welcome.tonStorageUnavailable' : 'welcome.tonRecoveryRequired') }}</p>
        <FButton text="common.continue" size="big" @click="continueToWallet" />
      </div>

      <ValidatedInput
        v-else
        size="big"
        placeholder="common.password"
        errorDescriptions="common.invalidPassword"
        :isError="isError"
        :showPassword="true"
        :value="password"
        @pressEnter="unlock"
        @change="changeSyncedPassword"
      />

      <FButton
        v-if="!tonRecoveryNotice"
        class="unlock-btn"
        text="welcome.unlock"
        size="big"
        :disabled="isDisabledBtn"
        :border="false"
        @click="unlock"
      />

      <div class="bottom">
        <span class="pink" @click="toggleResetPopup">{{ t('welcome.forgotYourPassword') }}</span>

        <div class="fearless-support">
          <span>{{ t('welcome.needHelp') }}</span>

          <span class="pink" @click="openSupport">&nbsp;{{ t('common.fearlessSupport') }}</span>
        </div>
      </div>
    </div>

    <ResetPopup v-if="showResetPopup" @close="toggleResetPopup" />
  </div>
</template>

<script lang="ts" setup>
import { watch, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from '@/locales/useI18n';
import { unlockExtension, windowOpen } from '@/extension/messaging';
import { Components } from '@/router/routes';
import { IS_POPUP } from '@/consts/globalClient';
import { URLS } from '@/consts/urls';
import ResetPopup from '@/screens/welcome/ResetPopup.vue';
import { resolveUnlockRedirect } from '@/router/unlockRedirect';

const router = useRouter();
const route = useRoute();
const password = ref('');
const isError = ref(false);
const showResetPopup = ref(false);
const isDisabledBtn = ref(false);
const isPopup = ref(IS_POPUP);
const { t } = useI18n();
const tonRecoveryNotice = ref<'ton-recovery-required' | 'ton-storage-unavailable' | ''>('');

watch(password, () => (isError.value = false));

const changeSyncedPassword = (pass: string) => (password.value = pass);

const continueToWallet = () => router.push(resolveUnlockRedirect(route.query.redirect) ?? { name: Components.Wallet });

const unlock = async () => {
  isDisabledBtn.value = true;

  const isUnlock = await unlockExtension({ password: password.value });

  if (isUnlock === 'ton-recovery-required' || isUnlock === 'ton-storage-unavailable') {
    password.value = '';
    tonRecoveryNotice.value = isUnlock;
    return;
  }

  if (isUnlock) {
    continueToWallet();

    return;
  }

  isDisabledBtn.value = false;
  isError.value = true;
};

const openFullScreen = () => {
  windowOpen(resolveUnlockRedirect(route.query.redirect) ?? '/');
  window.close();
};

const openSupport = () => window.open(URLS.FEARLESS_HAPPINESS);

const toggleResetPopup = () => (showResetPopup.value = !showResetPopup.value);
</script>

<style lang="scss" scoped>
.unlock {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;

  .header {
    display: flex;
    justify-content: flex-end;
  }

  .logo-container {
    display: flex;
    flex-direction: column;
  }

  .logo-animated {
    width: 70%;
    height: 70%;
    margin: auto;
  }

  .pass-block {
    .recovery-notice {
      font-size: 14px;
      line-height: 1.5;
      margin-bottom: 16px;
    }

    .unlock-btn {
      margin: 16px 0;
    }
  }

  .bottom {
    display: flex;
    justify-content: space-between;

    .fearless-support {
      font-size: 12px;
      color: $gray-color;
    }

    .pink {
      color: $pink-color;
      cursor: pointer;
    }
  }
}
</style>
