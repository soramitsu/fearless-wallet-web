<template>
  <AboveForm :fullScreen="true" header="common.changePassword" @closeHandler="close">
    <Scroll>
      <div class="password-content">
        <div>
          <div class="warning">{{ $t('welcome.passwordWarning') }}</div>

          <ValidatedInput
            v-if="alreadyHasMasterPassword"
            ref="oldPassInput"
            class="old-pass"
            :value="oldPassword"
            :errorDescriptions="$t('addWallet.notMatchPassword')"
            :placeholder="$t('welcome.oldPassword')"
            :isError="isErrorOldPassword"
            :showPassword="true"
            @change="changeOldPass"
          />

          <PasswordForm :focus="!alreadyHasMasterPassword" @setPassword="setPassword" />
        </div>

        <FButton
          size="big"
          fontSize="big"
          width="100%"
          text="common.confirm"
          :disabled="isDisabled"
          @click="changePassword"
        />
      </div>
    </Scroll>
  </AboveForm>
</template>

<script lang="ts" setup>
import { useRouter, useRoute } from 'vue-router/composables';
import { ref, nextTick, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n-composable';
import ValidatedInput from '@/components/ValidatedInput.vue';
import PasswordForm from '@/screens/addWallet/PasswordForm.vue';
import {
  extensionChangePassword,
  hasMasterPassword,
  unlockExtension,
  initGoogleAuth,
  hasAccounts,
  isNeedMigration,
} from '@/extension/messaging';
import { Components } from '@/router/routes';
import { useNotify } from '@/plugins/soramitsuUI';

const router = useRouter();
const route = useRoute();
const notify = useNotify();
const { t } = useI18n();

const oldPassword = ref('');
const walletPassword = ref('');
const oldPassInput = ref<ValidatedInput>();
const isErrorOldPassword = ref(false);
const alreadyHasMasterPassword = ref(false);
const needMigration = ref(false);
const hasAccount = ref(false);
const isWait = ref(false);
const isAuthFlowInit = ref(false);

const isDisabled = computed(
  () =>
    isWait.value ||
    isAuthFlowInit.value ||
    isErrorOldPassword.value ||
    walletPassword.value === '' ||
    oldPassword.value === walletPassword.value ||
    (oldPassword.value === '' && alreadyHasMasterPassword.value)
);

// Update alreadyHasMasterPassword, hasAccount, isNeedMigration
(async () => {
  alreadyHasMasterPassword.value = await hasMasterPassword();
  hasAccount.value = await hasAccounts();
  needMigration.value = await isNeedMigration();
})();

watch(alreadyHasMasterPassword, async () => {
  await nextTick();

  if (alreadyHasMasterPassword.value) oldPassInput.value.input.focus();
});

const changeOldPass = async (password: string) => {
  oldPassword.value = password;

  const isInlock = await unlockExtension({ password: oldPassword.value });

  isErrorOldPassword.value = !isInlock;
};

const setPassword = (password: string) => (walletPassword.value = password);

const close = (isClose = true) => {
  if (isClose) {
    router.back();

    return;
  }

  if (needMigration.value) {
    router.push({ name: Components.MigrationAccounts });

    return;
  }

  // If the password already existed or there are created accounts, then we "change the password" and not "set it"
  // Need to go to the Wallet age
  if (alreadyHasMasterPassword.value || hasAccount.value) {
    router.push({ name: Components.Wallet });

    return;
  }

  const componentName = route.params.name;
  const type = route.params.type;

  if (componentName === 'GoogleAuth') {
    if (!isAuthFlowInit.value) {
      isAuthFlowInit.value = true;

      initGoogleAuth().finally(() => (isAuthFlowInit.value = false));
    }
  } else if (componentName) router.push({ name: componentName, params: { type } });
  else router.push({ name: 'AddWallet', params: { type: 'create' } });
};

const changePassword = async () => {
  isWait.value = true;

  await extensionChangePassword({ oldPassword: oldPassword.value, newPassword: walletPassword.value });

  const title = t(
    `welcome.${alreadyHasMasterPassword.value ? 'successfulChangePassword' : 'masterPasswordSetUp'}`
  ).toString();

  notify({ title, message: '', type: 'success' });

  close(false);

  isWait.value = false;
};
</script>

<style lang="scss" scoped>
.password-content {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.warning {
  color: $default-white;
  padding: 0 $default-padding;
  text-align: left;
  margin-bottom: 14px;
}

.old-pass {
  margin-bottom: 14px;
}
</style>
