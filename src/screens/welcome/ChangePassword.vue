<template>
  <AboveForm :fullScreen="true" :header="header" @closeHandler="close">
    <Scroll>
      <div class="password-content" :aria-busy="isLoading || isWait">
        <div v-if="loadFailed" role="alert" data-testid="passwordLoadFailed">
          <p>{{ t('migration.loadFailed') }}</p>
          <FButton text="ux.retry" type="secondary" @click="loadStatus" />
        </div>
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
import { useRouter, useRoute } from 'vue-router';
import { ref, nextTick, computed, watch, onBeforeUnmount } from 'vue';
import { useI18n } from '@/locales/useI18n';
import ValidatedInput from '@/components/ValidatedInput.vue';
import PasswordForm from '@/screens/addWallet/PasswordForm.vue';
import {
  extensionChangePassword,
  hasMasterPassword,
  unlockExtension,
  initGoogleAuth,
  hasAccounts,
  isNeedMigration,
  getAccessStatus,
} from '@/extension/messaging';
import { Components } from '@/router/routes';
import { useNotify } from '@/plugins/soramitsuUI';

const router = useRouter();
const route = useRoute();
const notify = useNotify();
const { t, tc } = useI18n();

const oldPassword = ref('');
const walletPassword = ref('');
const routeParam = (value: string | string[] | undefined): string => (Array.isArray(value) ? value[0] ?? '' : value ?? '');

const oldPassInput = ref<InstanceType<typeof ValidatedInput> | null>(null);
const isErrorOldPassword = ref(false);
const alreadyHasMasterPassword = ref(false);
const needMigration = ref(false);
const hasAccount = ref(false);
const isWait = ref(false);
const isAuthFlowInit = ref(false);
const isLoading = ref(true);
const loadFailed = ref(false);
const isValidatingPassword = ref(false);
let disposed = false;
let validationRevision = 0;
let loadingStatus = false;
onBeforeUnmount(() => { disposed = true; validationRevision++; });

const isDisabled = computed(
  () =>
    isLoading.value ||
    loadFailed.value ||
    isValidatingPassword.value ||
    isWait.value ||
    isAuthFlowInit.value ||
    isErrorOldPassword.value ||
    walletPassword.value === '' ||
    oldPassword.value === walletPassword.value ||
    (oldPassword.value === '' && alreadyHasMasterPassword.value)
);

const loadStatus = async () => {
  if (disposed || loadingStatus) return;
  loadingStatus = true;
  isLoading.value = true;
  loadFailed.value = false;
  try {
    const [password, accounts, migration] = await Promise.all([hasMasterPassword(), hasAccounts(), isNeedMigration()]);
    if (disposed) return;
    alreadyHasMasterPassword.value = password;
    hasAccount.value = accounts;
    needMigration.value = migration;
  } catch {
    if (!disposed) loadFailed.value = true;
  } finally {
    loadingStatus = false;
    if (!disposed) isLoading.value = false;
  }
};
void loadStatus();

const header = computed(() => (alreadyHasMasterPassword.value ? 'common.changePassword' : 'common.createPassword'));

watch(alreadyHasMasterPassword, async () => {
  await nextTick();

  if (alreadyHasMasterPassword.value) oldPassInput.value?.input?.focus();
});

const changeOldPass = async (password: string) => {
  if (disposed || isWait.value) return;
  const revision = ++validationRevision;
  oldPassword.value = password;
  isValidatingPassword.value = true;
  const unlocked = await unlockExtension({ password }).catch(() => false);
  if (disposed || revision !== validationRevision) return;
  isErrorOldPassword.value = !unlocked;
  isValidatingPassword.value = false;
};

const setPassword = (password: string) => (walletPassword.value = password);

const close = (isClose = true) => {
  if (disposed) return;
  if (isClose) {
    router.back();

    return;
  }

  if (needMigration.value) {
    router.push({ name: Components.MigrationAccounts });

    return;
  }

  // If the password already existed or there are created accounts, then we "change the password" and not "set it"
  // Need to go to the Wallet page
  if (alreadyHasMasterPassword.value || hasAccount.value) {
    router.push({ name: Components.Wallet });

    return;
  }

  const componentName = routeParam(route.params.name);
  const type = routeParam(route.params.type);
  const walletEcosystem = routeParam(route.params.walletEcosystem);

  if (componentName === 'GoogleAuth') {
    if (!isAuthFlowInit.value) {
      isAuthFlowInit.value = true;

      initGoogleAuth().finally(() => (isAuthFlowInit.value = false));
    }
  } else if (componentName)
    router.push({ name: componentName, params: { type, walletEcosystem } });
  else
    router.push({
      name: 'AddWallet',
      params: { type: 'create' },
    });
};

const changePassword = async () => {
  if (disposed || isDisabled.value) return;
  isWait.value = true;

  // A transport failure can hide an acknowledged commit. Failure copy must not promise that the old password remains.
  const changed = await extensionChangePassword({ oldPassword: oldPassword.value, newPassword: walletPassword.value }).catch(
    () => false
  );

  if (disposed) return;
  if (!changed) {
    isWait.value = false;

    const failure = alreadyHasMasterPassword.value ? 'changePasswordFailed' : 'createPasswordFailed';

    notify({ title: t(`welcome.${failure}`), message: '', type: 'error' });

    return;
  }

  const title = t(
    `welcome.${alreadyHasMasterPassword.value ? 'successfulChangePassword' : 'masterPasswordSetUp'}`
  ).toString();

  notify({ title, message: '', type: 'success' });

  // A key or TON phrase that did not open with the old password was left exactly as it is. Say so, and that
  // Account access unlocks it (the wallet shows the same reminder).
  const waiting = await getAccessStatus()
    .then(({ issues }) => issues.filter(({ kind }) => kind === 'previous_master_password').length)
    .catch(() => 0);

  if (disposed) return;
  if (waiting) {
    notify({ title: tc('accountAccess.changePasswordPending', waiting, { count: waiting }), message: '', type: 'info' });
  }

  // Confirm stays disabled until the screen is left: a second press would check the old password again and fail.
  close(false);
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
