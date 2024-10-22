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
        <img class="logo-animated" src="@/assets/fearless-logo-animated.gif" alt="fearless-logo" />

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
        :value="password"
        @change="changeSyncedPassword"
      />

      <FButton class="unlock-btn" text="welcome.unlock" :border="false" size="big" @click="unlock" />

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
import { useRouter } from 'vue-router/composables';
import { useI18n } from 'vue-i18n-composable';
import { unlockExtension, windowOpen } from '@/extension/messaging';
import { Components } from '@/router/routes';
import { IS_POPUP } from '@/consts/globalClient';
import { URLS } from '@/consts/urls';
import ResetPopup from '@/screens/welcome/ResetPopup.vue';

const router = useRouter();
const password = ref('');
const isError = ref(false);
const showResetPopup = ref(false);
const isPopup = ref(IS_POPUP);
const { t } = useI18n();

watch(password, () => (isError.value = false));

const changeSyncedPassword = (pass: string) => (password.value = pass);

const unlock = async () => {
  const isUnlock = await unlockExtension({ password: password.value });

  if (isUnlock) router.push({ name: Components.Wallet });
  else isError.value = true;
};

const openFullScreen = () => {
  windowOpen('/');
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
