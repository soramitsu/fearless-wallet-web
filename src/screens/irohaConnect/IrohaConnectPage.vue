<template>
  <div class="iroha-connect-page">
    <header class="iroha-connect-header">
      <button class="back-button" type="button" :aria-label="t('irohaConnectPage.backToSettings')" @click="goBack">
        <Icon icon="chevron-left" :hover="false" />
      </button>
      <div>
        <p class="eyebrow">{{ t('irohaConnectPage.walletBridge') }}</p>
        <h1>IrohaConnect</h1>
      </div>
      <span class="status-pill" :data-phase="snapshot.phase">{{ statusLabel }}</span>
    </header>

    <ContentForm :height="contentHeight" backgroundColor="black">
      <Scroll>
        <main class="connect-canvas" aria-labelledby="iroha-connect-title">
          <div class="sakura-field" :class="{ 'is-active': sakuraActive }" aria-hidden="true">
            <span
              v-for="petal in petals"
              :key="petal"
              class="sakura-petal"
              :style="{
                '--petal-left': `${(petal * 41) % 97}%`,
                '--petal-drift': `${petal % 2 ? 18 : -18}px`,
                '--petal-duration': `${4.2 + petal * 0.19}s`,
                '--petal-delay': `${petal * -0.43}s`,
                '--petal-rest-top': `${35 + petal * 31}px`,
                '--petal-rest-rotation': `${petal * 31}deg`,
              }"
            />
          </div>

          <section class="brand-intro">
            <div class="iroha-mark" aria-hidden="true">
              <Icon icon="iroha-connect" :hover="false" />
            </div>
            <div>
              <p class="eyebrow">{{ t('irohaConnectPage.walletMode') }}</p>
              <h2 id="iroha-connect-title">{{ t('irohaConnectPage.sakuraTitle') }}</h2>
              <p>{{ t('irohaConnectPage.intro') }}</p>
            </div>
          </section>

          <p class="sr-status" aria-live="polite">{{ liveStatus }}</p>
          <div
            v-if="localizedError && snapshot.phase !== 'idle' && snapshot.phase !== 'error'"
            class="error-banner error-banner--global"
            role="alert"
          >
            {{ localizedError }}
          </div>

          <section v-if="snapshot.phase === 'idle' || snapshot.phase === 'error'" class="connect-step">
            <label for="iroha-connect-uri">{{ t('irohaConnectPage.linkLabel') }}</label>
            <textarea
              id="iroha-connect-uri"
              v-model="uri"
              data-testid="iroha-connect-uri"
              inputmode="url"
              maxlength="4096"
              placeholder="iroha://connect?sid=…"
              rows="3"
              spellcheck="false"
              @input="clearError"
            />
            <div class="input-meta">
              <span>{{ t('irohaConnectPage.pasteHint') }}</span>
              <button type="button" @click="pasteLink">{{ t('irohaConnectPage.paste') }}</button>
            </div>

            <div v-if="localizedError" class="error-banner" role="alert">
              {{ localizedError }}
            </div>

            <button
              class="action-button action-button--primary"
              data-testid="iroha-connect-start"
              type="button"
              :disabled="!canConnect || busy"
              @click="startConnection"
            >
              {{ busy ? t('irohaConnectPage.openingRelay') : t('irohaConnectPage.connectWallet') }}
            </button>
          </section>

          <section v-else-if="snapshot.phase === 'connecting'" class="connect-step connect-step--centered">
            <div class="connection-orbit" aria-hidden="true">
              <Icon icon="iroha-connect" :hover="false" />
            </div>
            <h3>{{ t('irohaConnectPage.waitingForDapp') }}</h3>
            <p>{{ t('irohaConnectPage.openingApprovedRelay') }}</p>
            <button class="action-button action-button--quiet" type="button" @click="disconnect">
              {{ t('irohaConnectPage.cancel') }}
            </button>
          </section>

          <section v-else-if="snapshot.phase === 'session-approval' && snapshot.session" class="connect-step">
            <div class="review-heading">
              <div>
                <p class="eyebrow">{{ t('irohaConnectPage.connectionRequest') }}</p>
                <h3>{{ snapshot.session.appName }}</h3>
              </div>
              <span class="network-stamp">{{ networkLabel }}</span>
            </div>

            <dl class="session-facts">
              <div>
                <dt>{{ t('irohaConnectPage.network') }}</dt>
                <dd>{{ networkLabel }}</dd>
              </div>
              <div>
                <dt>{{ t('irohaConnectPage.relay') }}</dt>
                <dd>{{ relayHost }}</dd>
              </div>
              <div v-if="snapshot.session.appUrl">
                <dt>{{ t('irohaConnectPage.app') }}</dt>
                <dd>{{ appHost }}</dd>
              </div>
              <div>
                <dt>{{ t('irohaConnectPage.permission') }}</dt>
                <dd>{{ t('irohaConnectPage.requestSignatures') }}</dd>
              </div>
            </dl>

            <fieldset class="account-list">
              <legend>{{ t('irohaConnectPage.chooseAccount') }}</legend>
              <label v-for="account in snapshot.accounts" :key="account.address" class="account-option">
                <input v-model="selectedAccount" type="radio" name="iroha-account" :value="account.address" />
                <span class="account-option__mark" aria-hidden="true" />
                <span>
                  <strong>{{ account.name || t('irohaConnectPage.irohaAccount') }}</strong>
                  <code>{{ shorten(account.address) }}</code>
                </span>
              </label>
              <p v-if="!snapshot.accounts.length" class="empty-copy">
                {{ t('irohaConnectPage.noSignableAccount', { network: networkLabel }) }}
              </p>
            </fieldset>

            <p class="security-note">{{ t('irohaConnectPage.seedSafety') }}</p>

            <div class="button-row">
              <button class="action-button action-button--quiet" type="button" :disabled="busy" @click="rejectSession">
                {{ t('irohaConnectPage.reject') }}
              </button>
              <button
                class="action-button action-button--primary"
                data-testid="iroha-connect-approve-session"
                type="button"
                :disabled="!selectedAccount || busy"
                @click="approveSession"
              >
                {{ busy ? t('irohaConnectPage.approving') : t('irohaConnectPage.approveConnection') }}
              </button>
            </div>
          </section>

          <section v-else-if="snapshot.phase === 'request-approval' && snapshot.request" class="connect-step">
            <div class="review-heading">
              <div>
                <p class="eyebrow">{{ t('irohaConnectPage.signatureRequest') }}</p>
                <h3>{{ requestTitle }}</h3>
              </div>
              <span class="network-stamp">{{ networkLabel }}</span>
            </div>

            <div class="signing-seal" aria-hidden="true">
              <Icon icon="iroha-connect" :hover="false" />
              <span>{{ t('irohaConnectPage.reviewBytes') }}</span>
            </div>

            <dl class="session-facts">
              <div v-if="snapshot.request.entrypoint">
                <dt>{{ t('irohaConnectPage.entrypoint') }}</dt>
                <dd>{{ snapshot.request.entrypoint }}</dd>
              </div>
              <div v-if="snapshot.request.contractAddress || snapshot.request.contractAlias">
                <dt>{{ t('irohaConnectPage.contract') }}</dt>
                <dd>{{ snapshot.request.contractAlias || shorten(snapshot.request.contractAddress || '') }}</dd>
              </div>
              <div>
                <dt>{{ t('irohaConnectPage.account') }}</dt>
                <dd>{{ shorten(snapshot.request.accountId) }}</dd>
              </div>
              <div>
                <dt>{{ t('irohaConnectPage.payload') }}</dt>
                <dd>{{ t('irohaConnectPage.byteCount', { count: snapshot.request.signingMessageBytes }) }}</dd>
              </div>
              <div class="payload-hash">
                <dt>SHA-256</dt>
                <dd>{{ snapshot.request.signingMessageSha256 }}</dd>
              </div>
            </dl>

            <p class="security-note security-note--warning">
              {{ t('irohaConnectPage.approveOnlyIfMatches', { appName: snapshot.session?.appName ?? '' }) }}
            </p>

            <div class="button-row">
              <button class="action-button action-button--quiet" type="button" :disabled="busy" @click="rejectRequest">
                {{ t('irohaConnectPage.reject') }}
              </button>
              <button
                class="action-button action-button--primary"
                data-testid="iroha-connect-approve-request"
                type="button"
                :disabled="busy"
                @click="approveRequest"
              >
                {{ busy ? t('irohaConnectPage.signing') : t('irohaConnectPage.approveSignature') }}
              </button>
            </div>
          </section>

          <section v-else-if="snapshot.phase === 'connected'" class="connect-step connect-step--connected">
            <div class="connected-blossom" aria-hidden="true">
              <Icon icon="iroha-connect" :hover="false" />
            </div>
            <p class="eyebrow">{{ t('irohaConnectPage.connected') }}</p>
            <h3>{{ snapshot.session?.appName || 'Iroha dApp' }}</h3>
            <p>{{ networkLabel }} · {{ selectedAccountName }}</p>
            <code>{{ shorten(snapshot.selectedAccountId || '') }}</code>
            <div class="waiting-line"><span /> {{ t('irohaConnectPage.waitingForRequest') }}</div>
            <button class="action-button action-button--quiet" type="button" @click="disconnect">
              {{ t('irohaConnectPage.disconnect') }}
            </button>
          </section>
        </main>
      </Scroll>
    </ContentForm>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  EMPTY_IROHA_CONNECT_SNAPSHOT,
  type IrohaConnectSnapshot,
} from '@extension-base/services/iroha-connect-service/types';
import { CONTENT_FORM_HEIGHT } from '@/consts/global';
import { Components } from '@/router/routes';
import { getClipboard } from '@/helpers';
import {
  approveIrohaConnectRequest,
  approveIrohaConnectSession,
  clearIrohaConnectError,
  connectIrohaConnect,
  disconnectIrohaConnect,
  rejectIrohaConnectRequest,
  rejectIrohaConnectSession,
  subscribeIrohaConnect,
} from '@/extension/messaging';
import { useI18n } from '@/locales/useI18n';

const router = useRouter();
const { t } = useI18n();
const contentHeight = CONTENT_FORM_HEIGHT;
const petals = Array.from({ length: 14 }, (_, index) => index + 1);
const snapshot = ref<IrohaConnectSnapshot>({ ...EMPTY_IROHA_CONNECT_SNAPSHOT });
const selectedAccount = ref('');
const uri = ref('');
const busy = ref(false);
const localError = ref('');
const localizedError = computed(() =>
  snapshot.value.error ? t('irohaConnectPage.actionFailed') : localError.value
);

const canConnect = computed(() => /^(?:iroha|irohaconnect):\/\/connect\?/u.test(uri.value.trim()));
const sakuraActive = computed(() =>
  ['connecting', 'session-approval', 'request-approval'].includes(snapshot.value.phase)
);
const networkLabel = computed(() =>
  snapshot.value.session?.network === 'taira' ? 'SORA Taira testnet' : 'SORA Nexus'
);
const statusLabel = computed(() => {
  switch (snapshot.value.phase) {
    case 'connecting':
      return t('irohaConnectPage.status.pairing');
    case 'session-approval':
    case 'request-approval':
      return t('irohaConnectPage.status.review');
    case 'connected':
      return t('irohaConnectPage.status.connected');
    case 'error':
      return t('irohaConnectPage.status.attention');
    default:
      return t('irohaConnectPage.status.ready');
  }
});
const liveStatus = computed(() => {
  if (snapshot.value.error) return t('irohaConnectPage.actionFailed');
  if (snapshot.value.phase === 'session-approval')
    return t('irohaConnectPage.live.connectionRequested', { appName: snapshot.value.session?.appName ?? '' });
  if (snapshot.value.phase === 'request-approval') return t('irohaConnectPage.live.signatureReview');
  if (snapshot.value.phase === 'connected')
    return t('irohaConnectPage.live.connectedTo', { appName: snapshot.value.session?.appName ?? '' });
  if (snapshot.value.phase === 'connecting') return t('irohaConnectPage.live.openingRelay');

  return t('irohaConnectPage.live.ready');
});
const relayHost = computed(() => hostFromUrl(snapshot.value.session?.toriiBaseUrl));
const appHost = computed(() => hostFromUrl(snapshot.value.session?.appUrl));
const requestTitle = computed(() => snapshot.value.request?.entrypoint || t('irohaConnectPage.contractCall'));
const selectedAccountName = computed(
  () =>
    snapshot.value.accounts.find(({ address }) => address === snapshot.value.selectedAccountId)?.name ||
    t('irohaConnectPage.irohaAccount')
);

watch(
  () => snapshot.value.accounts,
  (accounts) => {
    if (!accounts.some(({ address }) => address === selectedAccount.value)) {
      selectedAccount.value = accounts[0]?.address || '';
    }
  },
  { immediate: true }
);

onMounted(async () => {
  try {
    snapshot.value = await subscribeIrohaConnect((next) => (snapshot.value = next));
  } catch (error) {
    localError.value = readableError(error);
  }

  if (snapshot.value.phase !== 'idle') return;

  try {
    const clipboard = getClipboard().trim();
    if (/^(?:iroha|irohaconnect):\/\/connect\?/u.test(clipboard)) uri.value = clipboard;
  } catch {
    // Clipboard access is optional; the visible paste control remains available.
  }
});

function hostFromUrl(value?: string): string {
  if (!value) return '—';
  try {
    return new URL(value).host;
  } catch {
    return t('irohaConnectPage.invalidUrl');
  }
}

function shorten(value: string): string {
  return value.length > 24 ? `${value.slice(0, 11)}…${value.slice(-9)}` : value;
}

function readableError(_error: unknown): string {
  return t('irohaConnectPage.actionFailed');
}

async function run(action: () => Promise<IrohaConnectSnapshot>): Promise<void> {
  busy.value = true;
  localError.value = '';
  try {
    snapshot.value = await action();
  } catch (error) {
    localError.value = readableError(error);
  } finally {
    busy.value = false;
  }
}

async function clearError(): Promise<void> {
  localError.value = '';
  if (snapshot.value.phase === 'error') await run(clearIrohaConnectError);
}

function pasteLink(): void {
  try {
    uri.value = getClipboard().trim();
    void clearError();
  } catch {
    localError.value = t('irohaConnectPage.clipboardUnavailable');
  }
}

const startConnection = () => run(() => connectIrohaConnect({ uri: uri.value.trim() }));
const approveSession = () => run(() => approveIrohaConnectSession({ accountId: selectedAccount.value }));
const rejectSession = () => run(rejectIrohaConnectSession);
const approveRequest = () =>
  snapshot.value.request
    ? run(() => approveIrohaConnectRequest({ requestId: snapshot.value.request!.requestId }))
    : Promise.resolve();
const rejectRequest = () =>
  snapshot.value.request
    ? run(() => rejectIrohaConnectRequest({ requestId: snapshot.value.request!.requestId }))
    : Promise.resolve();
const disconnect = () => run(disconnectIrohaConnect);
const goBack = () => router.push({ name: Components.Settings });
</script>

<style lang="scss" scoped>
.iroha-connect-page {
  display: flex;
  flex-direction: column;
}

.iroha-connect-header {
  min-height: 64px;
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 0 2px 8px;
  text-align: left;

  h1 {
    margin: 1px 0 0;
    font-size: 1.25rem;
    line-height: 1;
  }
}

.back-button {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  background: transparent;
  color: #fff4dc;
  cursor: pointer;

  svg {
    width: 20px;
    height: 20px;
  }
}

.eyebrow {
  margin: 0;
  color: #d7a542;
  font-size: 0.63rem;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.status-pill {
  min-width: 58px;
  padding: 6px 8px;
  border: 1px solid rgba(255, 224, 154, 0.22);
  border-radius: 999px;
  color: rgba(255, 244, 220, 0.72);
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-align: center;
  text-transform: uppercase;

  &[data-phase='connected'] {
    border-color: rgba(128, 214, 128, 0.42);
    color: #99e299;
  }

  &[data-phase='error'] {
    border-color: rgba(238, 34, 51, 0.48);
    color: #ff929a;
  }
}

.connect-canvas {
  --connect-ink: #fff4dc;
  --connect-muted: rgba(255, 244, 220, 0.65);
  --connect-line: rgba(255, 224, 154, 0.17);
  position: relative;
  isolation: isolate;
  min-height: 100%;
  padding: 20px 18px 24px;
  overflow: hidden;
  background:
    radial-gradient(circle at 12% 0%, rgba(238, 34, 51, 0.2), transparent 220px),
    repeating-linear-gradient(92deg, rgba(255, 244, 220, 0.025) 0 1px, transparent 1px 23px),
    linear-gradient(145deg, #35090d, #130507 55%, #050303);
  color: var(--connect-ink);
  text-align: left;

  &::after {
    content: '';
    position: absolute;
    inset: 0 0 auto;
    z-index: -1;
    height: 3px;
    background: linear-gradient(90deg, #d7a542, #ee2233 48%, transparent 88%);
  }
}

.brand-intro {
  position: relative;
  z-index: 2;
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr);
  align-items: center;
  gap: 13px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--connect-line);

  h2 {
    margin: 4px 0 6px;
    font-size: 1.32rem;
    line-height: 1.08;
  }

  p:last-child {
    margin: 0;
    color: var(--connect-muted);
    font-size: 0.72rem;
    line-height: 1.5;
  }
}

.iroha-mark {
  width: 58px;
  height: 58px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(255, 244, 220, 0.42);
  border-radius: 10px;
  background: #fffaf0;
  color: #e4232d;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.35);

  svg {
    width: 44px;
    height: 44px;
  }
}

.connect-step {
  position: relative;
  z-index: 2;
  padding-top: 20px;
  animation: step-arrive 180ms ease-out both;

  > label,
  legend {
    margin-bottom: 8px;
    color: var(--connect-muted);
    font-size: 0.66rem;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }

  textarea {
    box-sizing: border-box;
    width: 100%;
    min-height: 88px;
    padding: 13px;
    resize: vertical;
    border: 1px solid var(--connect-line);
    border-radius: 8px;
    outline: none;
    background: rgba(4, 2, 2, 0.56);
    color: var(--connect-ink);
    font: 0.72rem/1.45 var(--s-font-family-mono);

    &:focus-visible {
      border-color: rgba(238, 34, 51, 0.8);
      box-shadow: 0 0 0 3px rgba(238, 34, 51, 0.16);
    }

    &::placeholder {
      color: rgba(255, 244, 220, 0.35);
    }
  }
}

.input-meta {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin: 8px 0 17px;
  color: var(--connect-muted);
  font-size: 0.65rem;
  line-height: 1.45;

  button {
    min-width: 50px;
    min-height: 32px;
    padding: 0 8px;
    border: 0;
    background: transparent;
    color: #ff7c85;
    cursor: pointer;
    font: inherit;
    font-weight: 700;
  }
}

.action-button {
  min-height: 46px;
  width: 100%;
  padding: 0 15px;
  border-radius: 8px;
  color: #fffaf0;
  cursor: pointer;
  font: inherit;
  font-size: 0.76rem;
  font-weight: 800;

  &:disabled {
    cursor: not-allowed;
    filter: grayscale(0.5);
    opacity: 0.48;
  }

  &:focus-visible {
    outline: 3px solid rgba(255, 224, 154, 0.35);
    outline-offset: 2px;
  }
}

.action-button--primary {
  border: 1px solid rgba(255, 126, 136, 0.76);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.16), transparent 45%), linear-gradient(180deg, #f03a48, #c81725);
  box-shadow: 0 12px 24px rgba(110, 8, 16, 0.26);
}

.action-button--quiet {
  border: 1px solid var(--connect-line);
  background: rgba(255, 244, 220, 0.055);
}

.error-banner,
.security-note {
  margin: 0 0 14px;
  padding: 11px 12px;
  border: 1px solid rgba(238, 34, 51, 0.4);
  border-radius: 8px;
  background: rgba(238, 34, 51, 0.1);
  color: #ffd2d5;
  font-size: 0.68rem;
  line-height: 1.45;
}

.error-banner--global {
  position: relative;
  z-index: 3;
  margin: 14px 0 -4px;
}

.connect-step--centered,
.connect-step--connected {
  padding-top: 30px;
  text-align: center;

  h3 {
    margin: 12px 0 5px;
    font-size: 1.08rem;
  }

  p {
    margin: 0 0 20px;
    color: var(--connect-muted);
    font-size: 0.72rem;
  }
}

.connection-orbit,
.connected-blossom {
  position: relative;
  width: 82px;
  height: 82px;
  display: grid;
  place-items: center;
  margin: 0 auto;
  border: 1px solid rgba(255, 224, 154, 0.32);
  border-radius: 50%;
  color: #ef3341;

  svg {
    width: 52px;
    height: 52px;
  }
}

.connection-orbit::after {
  content: '';
  position: absolute;
  inset: -5px;
  border: 2px solid transparent;
  border-top-color: #d7a542;
  border-right-color: rgba(238, 34, 51, 0.8);
  border-radius: 50%;
  animation: orbit 1.6s linear infinite;
}

.review-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 15px;

  h3 {
    margin: 3px 0 0;
    font-size: 1.15rem;
  }
}

.network-stamp {
  max-width: 112px;
  padding: 6px 8px;
  border: 1px solid rgba(215, 165, 66, 0.4);
  border-radius: 6px;
  color: #e9c57a;
  font-size: 0.59rem;
  font-weight: 700;
  line-height: 1.25;
  text-align: center;
}

.session-facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1px;
  margin: 0 0 16px;
  overflow: hidden;
  border: 1px solid var(--connect-line);
  border-radius: 8px;
  background: var(--connect-line);

  div {
    min-width: 0;
    padding: 11px;
    background: rgba(10, 4, 5, 0.86);
  }

  dt {
    margin-bottom: 5px;
    color: var(--connect-muted);
    font-size: 0.58rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  dd {
    margin: 0;
    overflow: hidden;
    color: var(--connect-ink);
    font: 0.68rem/1.35 var(--s-font-family-mono);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .payload-hash {
    grid-column: 1 / -1;

    dd {
      overflow-wrap: anywhere;
      text-overflow: clip;
      white-space: normal;
    }
  }
}

.account-list {
  display: grid;
  gap: 7px;
  margin: 0 0 14px;
  padding: 0;
  border: 0;
}

.account-option {
  min-height: 54px;
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  padding: 8px 11px;
  border: 1px solid var(--connect-line);
  border-radius: 8px;
  background: rgba(255, 244, 220, 0.04);
  cursor: pointer;

  input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
  }

  &:has(input:checked) {
    border-color: rgba(238, 34, 51, 0.7);
    background: rgba(238, 34, 51, 0.1);
  }

  &:has(input:focus-visible) {
    outline: 3px solid rgba(255, 224, 154, 0.3);
    outline-offset: 2px;
  }

  strong,
  code {
    display: block;
  }

  strong {
    margin-bottom: 4px;
    font-size: 0.74rem;
  }

  code {
    color: var(--connect-muted);
    font-size: 0.64rem;
  }
}

.account-option__mark {
  width: 16px;
  height: 16px;
  box-sizing: border-box;
  border: 1px solid rgba(255, 244, 220, 0.45);
  border-radius: 50%;
}

.account-option:has(input:checked) .account-option__mark {
  border: 5px solid #ee2233;
  background: #fff4dc;
}

.empty-copy {
  margin: 0;
  color: var(--connect-muted);
  font-size: 0.7rem;
  line-height: 1.45;
}

.security-note {
  border-color: rgba(215, 165, 66, 0.3);
  background: rgba(215, 165, 66, 0.08);
  color: rgba(255, 244, 220, 0.78);
}

.security-note--warning {
  border-color: rgba(238, 34, 51, 0.4);
  background: rgba(238, 34, 51, 0.1);
}

.button-row {
  display: grid;
  grid-template-columns: minmax(0, 0.72fr) minmax(0, 1.28fr);
  gap: 8px;
}

.signing-seal {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
  color: rgba(255, 244, 220, 0.78);
  font-size: 0.68rem;
  font-weight: 700;

  svg {
    width: 28px;
    height: 28px;
    color: #ef3341;
  }
}

.connect-step--connected {
  code {
    display: block;
    margin: -12px 0 18px;
    color: var(--connect-muted);
    font-size: 0.67rem;
  }
}

.waiting-line {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 22px;
  color: #99e299;
  font-size: 0.68rem;

  span {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #80d680;
    box-shadow: 0 0 0 4px rgba(128, 214, 128, 0.12);
  }
}

.sakura-field {
  position: absolute;
  inset: 0;
  z-index: 1;
  overflow: hidden;
  pointer-events: none;
}

.sakura-petal {
  position: absolute;
  top: -24px;
  left: var(--petal-left);
  width: 9px;
  height: 14px;
  border-radius: 70% 30% 65% 35%;
  background: linear-gradient(145deg, rgba(255, 218, 232, 0.94), rgba(246, 132, 176, 0.78));
  opacity: 0;
  transform: rotate(28deg);
}

.sakura-field.is-active .sakura-petal {
  animation: petal-fall var(--petal-duration) linear infinite;
  animation-delay: var(--petal-delay);
}

.sr-status {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@keyframes step-arrive {
  from {
    opacity: 0;
    transform: translateY(7px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes orbit {
  to {
    transform: rotate(360deg);
  }
}

@keyframes petal-fall {
  0% {
    opacity: 0;
    transform: translate3d(0, -10px, 0) rotate(0deg);
  }

  10%,
  75% {
    opacity: 0.72;
  }

  100% {
    opacity: 0;
    transform: translate3d(var(--petal-drift), 560px, 0) rotate(540deg);
  }
}

@media (max-width: 430px) {
  .connect-canvas {
    padding-inline: 14px;
  }

  .brand-intro {
    grid-template-columns: 50px minmax(0, 1fr);

    h2 {
      font-size: 1.12rem;
    }
  }

  .iroha-mark {
    width: 50px;
    height: 50px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .connect-step,
  .connection-orbit::after,
  .sakura-field.is-active .sakura-petal {
    animation: none;
  }

  .sakura-field.is-active .sakura-petal:nth-child(-n + 4) {
    top: var(--petal-rest-top);
    opacity: 0.22;
    transform: rotate(var(--petal-rest-rotation));
  }
}
</style>
