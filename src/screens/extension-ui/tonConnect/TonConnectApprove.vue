<template>
  <AboveForm header="browserTabs.authorize" :fullScreen="true" :showCloseIcon="!pending" @closeHandler="onReject">
    <div class="ton-connect" :aria-busy="!!pending">
      <p v-if="!request" role="status">{{ t('irohaConnectPage.waitingForRequest') }}</p>
      <template v-else>
        <section class="ton-connect__requester">
          <img
            v-if="iconUrl && !iconFailed"
            :key="request.id"
            class="ton-connect__icon"
            :src="iconUrl"
            width="48"
            height="48"
            alt=""
            referrerpolicy="no-referrer"
            @error="iconFailed = true"
          />
          <Icon v-else class="ton-connect__fallback" icon="globus" width="48px" height="48px" :hover="false" />
          <div>
            <h2 class="ton-connect__name" dir="auto">{{ request.manifest.name }}</h2>
            <p class="ton-connect__origin" dir="ltr">
              <span>{{ requester.before }}</span
              ><strong>{{ requester.domain }}</strong
              ><span>{{ requester.after }}</span>
            </p>
            <p class="ton-connect__status" :class="{ 'ton-connect__status--flagged': siteStatus === 'flagged' }" role="status">
              {{
                t(
                  siteStatus === 'checking'
                    ? 'signingReview.checking'
                    : siteStatus === 'flagged'
                      ? 'signingReview.flagged'
                      : 'portfolioPage.unverified'
                )
              }}
            </p>
          </div>
        </section>

        <template v-if="siteStatus !== 'flagged'">
          <p v-if="!request.manifestMatchesOrigin" role="alert" class="ton-connect__warning">
            {{ t('tonConnect.manifestMismatch', { app: manifestHost, site: requester.domain }) }}
          </p>
          <p class="ton-connect__text">{{ t('tonConnect.connectDescription') }}</p>
          <p v-if="request.proofDomain" class="ton-connect__text" data-testid="tonConnectProofNotice">
            {{ t('tonConnect.proofNotice', { domain: request.proofDomain }) }}
          </p>
          <p v-if="paused" role="alert" class="ton-connect__warning ton-connect__warning--danger">
            {{ t('signingReview.dappSigningPaused', { family: 'TON' }) }}
          </p>

          <fieldset v-if="request.accounts.length" class="ton-connect__accounts" :disabled="!!pending">
            <legend>{{ t('irohaConnectPage.account') }}</legend>
            <label v-for="account in request.accounts" :key="account.address" class="ton-connect__account">
              <input
                v-model="selected"
                type="radio"
                name="ton-connect-account"
                :value="account.address"
                :data-testid="`tonConnectAccount-${account.address}`"
              />
              <WalletInfo :name="account.name" :address="account.address" />
            </label>
          </fieldset>
          <p v-else role="alert" class="ton-connect__warning">{{ t('auth.noAccounts') }}</p>
        </template>

        <p v-if="actionError" ref="actionErrorElement" role="alert">{{ t('addWallet.google.somethingWrong') }}</p>

        <div ref="controls" class="ton-connect__controls">
          <FButton
            data-testid="rejectTonConnect"
            :text="siteStatus === 'flagged' || !request.accounts.length ? 'common.close' : 'common.reject'"
            :type="siteStatus === 'flagged' || paused || !request.accounts.length ? 'primary' : 'secondary'"
            size="big"
            fontSize="big"
            :disabled="!!pending"
            :loading="pending === 'reject'"
            @click="onReject"
          />
          <FButton
            v-if="siteStatus !== 'flagged' && request.accounts.length"
            data-testid="approveTonConnect"
            text="common.approve"
            size="big"
            fontSize="big"
            :disabled="cannotApprove"
            :loading="pending === 'approve'"
            :focusableWhenDisabled="true"
            :disabledReason="pending ? 'migration.pending' : siteStatus === 'checking' ? 'signingReview.checking' : 'migration.selectWallets'"
            @click="onApprove"
          />
        </div>
      </template>
    </div>
  </AboveForm>
</template>

<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { checkIfDenied } from '@polkadot/phishing';
import { signingRequester } from '../signing/requester';
import WalletInfo from '../signing/WalletInfo.vue';
import { useI18n } from '@/locales/useI18n';
import { useNotify } from '@/plugins/soramitsuUI';
import { Components } from '@/router/routes';
import { useExtensionStore } from '@/stores/extension';
import { useDappSigningKillSwitchStore } from '@/stores/dappSigningKillSwitch';
import { DAPP_SIGNING_FAMILY_NAMES, isDappSigningPaused, pausedDappSigningFamily } from '@/util/dappSigningKillSwitch';

const extensionStore = useExtensionStore();
const dappSigningKillSwitch = useDappSigningKillSwitchStore();
const router = useRouter();
const notify = useNotify();
const { t } = useI18n();

const request = computed(() => extensionStore.tonConnectRequests[0]);
const requestKey = computed(() => (request.value ? JSON.stringify(request.value) : ''));
const requester = computed(() => signingRequester(request.value?.origin ?? ''));
const selected = ref('');
const pending = ref<'approve' | 'reject' | null>(null);
const actionError = ref(false);
const actionErrorElement = ref<HTMLElement | null>(null);
const iconFailed = ref(false);
const siteStatus = ref<'checking' | 'flagged' | 'unverified'>('checking');
let active = true;
let checkGeneration = 0;

const iconUrl = computed(() => {
  try {
    const url = new URL(request.value?.manifest.iconUrl ?? '');

    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
});
const manifestHost = computed(() => {
  try {
    return new URL(request.value?.manifest.url ?? '').host;
  } catch {
    return '';
  }
});
// A proof is a signature, so the dApp-signing kill switch pauses a connect that asks for one.
const paused = computed(() => !!request.value?.proofDomain && isDappSigningPaused('ton', dappSigningKillSwitch.vetoes));
const cannotApprove = computed(
  () =>
    !!pending.value ||
    paused.value ||
    siteStatus.value !== 'unverified' ||
    !request.value?.accounts.some(({ address }) => address === selected.value)
);

const checkSite = async () => {
  const generation = ++checkGeneration;
  const captured = request.value;

  siteStatus.value = 'checking';
  if (!captured) return;

  let denied = false;

  try {
    denied = await checkIfDenied(captured.origin);
  } catch {
    /* Unverified is not an assurance of trust. */
  }
  if (active && generation === checkGeneration) siteStatus.value = denied ? 'flagged' : 'unverified';
};

const leaveEmpty = () => {
  if (active && !request.value && router.currentRoute.value.name === Components.TonConnectApprove)
    void router.push({ name: Components.Wallet }).catch(() => undefined);
};

const act = async (action: 'approve' | 'reject') => {
  const captured = request.value;

  if (!captured || pending.value || (action === 'approve' && cannotApprove.value)) return;
  pending.value = action;
  actionError.value = false;
  try {
    if (action === 'reject') await extensionStore.rejectTonConnect(captured.id);
    else if (await extensionStore.approveTonConnect({ id: captured.id, address: selected.value }))
      notify({ title: t('authorize.connectedTo', { url: requester.value.domain }), message: '', type: 'info' });
    else throw new Error('TON Connect request was not approved');
  } catch (error) {
    const pausedFamily = pausedDappSigningFamily(error);

    if (pausedFamily)
      notify({
        title: t('signingReview.dappSigningPaused', { family: DAPP_SIGNING_FAMILY_NAMES[pausedFamily] }),
        message: '',
        type: 'error',
      });
    else if (active && request.value === captured) {
      actionError.value = true;
      await nextTick();
      actionErrorElement.value?.scrollIntoView?.({ block: 'nearest' });
    }
  } finally {
    if (active) pending.value = null;
  }
};

const onApprove = () => act('approve');
const onReject = () => act('reject');

watch(
  requestKey,
  () => {
    iconFailed.value = false;
    actionError.value = false;
    selected.value = request.value?.defaultAddress ?? request.value?.accounts[0]?.address ?? '';
    void checkSite();
    leaveEmpty();
  },
  { immediate: true }
);

onMounted(leaveEmpty);
onBeforeUnmount(() => {
  active = false;
  checkGeneration += 1;
});
</script>

<style lang="scss" scoped>
.ton-connect {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 100%;
  text-align: left;

  p {
    margin: 0;
    overflow-wrap: anywhere;
  }
}

.ton-connect__requester {
  display: flex;
  gap: 12px;
  align-items: start;
  padding: 16px;
  background: var(--fw-raised);
  border-radius: 16px;
  border: 1px solid var(--fw-stroke-control);

  > div {
    min-width: 0;
    display: grid;
    gap: 6px;
  }
}

.ton-connect__icon {
  flex-shrink: 0;
  object-fit: contain;
  border-radius: 12px;
}

.ton-connect__fallback {
  flex-shrink: 0;
  fill: none;
}

.ton-connect__name {
  font-size: 1.125rem;
  margin: 0;
  overflow-wrap: anywhere;
}

.ton-connect__origin {
  font-family: var(--fw-font-mono);
  color: var(--fw-text-2);
  unicode-bidi: isolate;

  strong {
    color: var(--fw-text-1);
    font-weight: 500;
  }
}

.ton-connect__status {
  color: var(--fw-text-2);
}

.ton-connect__status--flagged {
  color: var(--fw-danger);
}

.ton-connect__text {
  color: var(--fw-text-1);
}

.ton-connect__warning {
  border: 1px solid var(--fw-warning);
  border-radius: 12px;
  padding: 16px;
  color: var(--fw-text-1);
}

.ton-connect__warning--danger {
  border-color: var(--fw-danger);
}

.ton-connect__accounts {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 16px;
  border-radius: 16px;
  border: 1px solid var(--fw-stroke-control);
  background: var(--fw-raised);

  legend {
    font-weight: 700;
    color: var(--fw-text-2);
    padding: 0 4px;
  }
}

.ton-connect__account {
  display: flex;
  gap: 12px;
  align-items: center;
  min-height: 48px;
  cursor: pointer;

  input {
    flex-shrink: 0;
    width: 20px;
    height: 20px;
    accent-color: var(--fw-accent, currentColor);
  }

  input:focus-visible {
    outline: 2px solid var(--fw-focus);
    outline-offset: 2px;
  }
}

.ton-connect__controls {
  display: flex;
  flex-flow: row wrap;
  gap: 12px;
  margin-top: auto;

  > * {
    flex: 1 1 200px;
    min-width: 0;
  }
}
</style>
