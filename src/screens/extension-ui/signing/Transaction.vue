<template>
  <AboveForm
    :fullScreen="true"
    header="walletConnect.signRequestTitle"
    :showCloseIcon="!pending"
    @closeHandler="onReject"
  >
    <div class="signing-review" :aria-busy="!!pending">
      <p v-if="actionError && !request" role="alert">{{ t('addWallet.google.somethingWrong') }}</p>
      <p v-if="!request" role="status">{{ t('irohaConnectPage.waitingForRequest') }}</p>
      <template v-else-if="review">
        <section class="signing-requester">
          <img
            v-if="siteStatus === 'unverified' && faviconUrl && !faviconFailed"
            :key="requestKey"
            class="signing-favicon"
            :src="faviconUrl"
            width="40"
            height="40"
            alt=""
            referrerpolicy="no-referrer"
            @error="faviconFailed = true"
          />
          <Icon v-else class="signing-fallback" icon="globus" width="40px" height="40px" :hover="false" />
          <div>
            <p class="signing-origin" dir="ltr">
              <span>{{ requester.before }}</span
              ><strong>{{ requester.domain }}</strong
              ><span>{{ requester.after }}</span>
            </p>
            <p class="signing-status" :class="{ 'signing-status--flagged': siteStatus === 'flagged' }" role="status">
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
            <p class="signing-method">
              <template v-if="walletConnect">WalletConnect · </template>{{ review.protocol }} · {{ review.method }}
            </p>
          </div>
        </section>
        <template v-if="siteStatus !== 'flagged'">
          <div
            v-for="(action, index) in review.actions"
            :key="index"
            class="signing-action"
            :class="{ 'signing-action--danger': action.refusal || action.highRisk }"
          >
            <p v-if="action.transactionIndex" class="signing-method">
              {{ t('assets.transaction') }} {{ action.transactionIndex }}
            </p>
            <h2>
              {{
                t(
                  action.kind === 'transfer'
                    ? 'assets.transfer'
                    : action.kind === 'message'
                      ? 'walletConnect.requestFields.message'
                      : action.kind === 'typedData'
                        ? 'signingReview.typedData'
                        : action.kind === 'crossChain'
                          ? 'signingReview.crossChainTitle'
                          : 'signingReview.unknownAction'
                )
              }}
            </h2>
            <template v-if="action.kind === 'crossChain'">
              <p class="signing-cross-chain">{{ t('signingReview.crossChainNotice') }}</p>
              <p class="signing-method" dir="ltr">{{ action.call }}</p>
              <dl class="signing-fields">
                <template v-if="action.destination"
                  ><dt>{{ t('crossChainPage.destinationNetwork') }}</dt>
                  <dd dir="ltr">{{ destinationLabel(action.destination) }}</dd></template
                >
                <template v-if="action.to"
                  ><dt>{{ t('historyDetails.to') }}</dt>
                  <dd dir="ltr">{{ action.to }}</dd></template
                >
                <template v-for="(item, assetIndex) in action.assets" :key="assetIndex"
                  ><dt>{{ t('crossChainPage.asset') }}</dt>
                  <dd dir="ltr">{{ item.asset }}</dd>
                  <dt>{{ t('historyDetails.amount') }}</dt>
                  <dd dir="ltr">{{ item.amount }}</dd></template
                >
              </dl>
              <p v-if="action.refusal" role="alert" class="signing-warning signing-warning--danger">
                {{ t(REFUSAL_REASONS[action.refusal]) }}
              </p>
              <p v-else-if="action.highRisk" role="alert" class="signing-warning signing-warning--danger">
                {{ t('signingReview.crossChainHighRisk') }}
              </p>
            </template>
            <template v-else>
              <p v-if="action.amount" class="signing-amount">{{ action.amount }}</p>
              <dl v-if="action.from || action.to || action.asset" class="signing-fields">
                <template v-if="action.from"
                  ><dt>{{ t('historyDetails.from') }}</dt>
                  <dd dir="ltr">{{ action.from }}</dd></template
                >
                <template v-if="action.to"
                  ><dt>{{ t('historyDetails.to') }}</dt>
                  <dd dir="ltr">{{ action.to }}</dd></template
                >
                <template v-if="action.asset"
                  ><dt>{{ t('crossChainPage.asset') }}</dt>
                  <dd dir="ltr">{{ action.asset }}</dd></template
                >
              </dl>
              <pre v-if="action.text" class="signing-message" dir="auto">{{ action.text }}</pre>
            </template>
          </div>
          <dl class="signing-fields signing-context">
            <dt>{{ t('common.network') }}</dt>
            <dd>
              <span class="signing-network"
                ><Icon icon="all-networks" width="32px" height="32px" :hover="false" />{{
                  review.network || t('portfolioPage.unknownNetwork')
                }}</span
              >
              <span v-if="review.networkIdentity" class="signing-identifier" dir="ltr">{{
                review.networkIdentity
              }}</span>
            </dd>
            <dt>{{ t('irohaConnectPage.account') }}</dt>
            <dd><WalletInfo :name="request.account.name || ''" :address="request.account.address" /></dd>
            <dt>
              {{
                t(
                  review.feeKind === 'maximum'
                    ? 'signingReview.maximumFee'
                    : review.feeKind === 'estimate'
                      ? 'signingReview.estimateFee'
                      : 'common.networkFees'
                )
              }}
            </dt>
            <dd>
              {{
                review.fee ||
                t(review.feeKind === 'signOnly' ? 'signingReview.signOnlyFee' : 'signingReview.feeUnavailable')
              }}
            </dd>
          </dl>
          <p v-if="review.refused" role="alert" class="signing-warning signing-warning--danger">
            {{ t('signingReview.crossChainRefused') }}
          </p>
          <p v-else-if="review.blocked" role="alert" class="signing-warning">{{ t('signingReview.invalidRequest') }}</p>
          <p v-else-if="review.blind" role="alert" class="signing-warning">
            {{ t('signingReview.blindWarning', { origin }) }}
          </p>
          <p v-else class="signing-caution">{{ t('walletConnect.txHint') }}</p>
          <details ref="rawDetails" :key="requestKey" class="signing-raw" @toggle="onRawToggle">
            <summary>{{ t('signingReview.rawData') }}</summary>
            <pre v-if="rawExpanded" dir="ltr">{{ review.raw }}</pre>
          </details>
          <Checkbox
            v-if="review.blind && !review.blocked"
            :label="t('signingReview.acknowledge')"
            :value="acknowledged"
            :disabled="!!pending"
            @change="onAcknowledge"
          />
          <Checkbox
            v-if="review.highRisk && !review.blocked"
            data-testid="crossChainHighRiskAcknowledge"
            :label="t('signingReview.crossChainHighRiskAcknowledge')"
            :value="highRiskAcknowledged"
            :disabled="!!pending"
            @change="onHighRiskAcknowledge"
          />
          <p v-if="pending === 'approve'" role="status">
            {{ t(isMobile ? 'mobileConnector.signMobile' : 'irohaConnectPage.signing') }}
          </p>
        </template>
        <p v-if="actionError" ref="actionErrorElement" role="alert">{{ t('addWallet.google.somethingWrong') }}</p>
        <div ref="controls" class="signing-controls">
          <FButton
            :data-testid="rejectTestId"
            :text="siteStatus === 'flagged' ? 'common.close' : 'common.reject'"
            :type="review.blind || siteStatus === 'flagged' ? 'primary' : 'secondary'"
            size="big"
            fontSize="big"
            :disabled="!!pending"
            :loading="pending === 'reject'"
            @click="onReject"
          />
          <FButton
            v-if="siteStatus !== 'flagged' && !review.blocked"
            :data-testid="approveTestId"
            :text="review.blind ? 'signingReview.signAnyway' : 'common.approve'"
            :type="review.blind ? 'secondary' : 'primary'"
            size="big"
            fontSize="big"
            :disabled="cannotApprove"
            :loading="pending === 'approve'"
            :focusableWhenDisabled="true"
            :disabledReason="
              pending
                ? 'migration.pending'
                : siteStatus === 'checking'
                  ? 'signingReview.checking'
                  : 'signingReview.reviewFirst'
            "
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
import { signingRequester } from './requester';
import { signingRequestKind, signingReview, type ReviewRequest } from './review';
import { walletConnectReview } from './walletConnectReview';
import WalletInfo from './WalletInfo.vue';
import type { RetiredDestinationCode } from '@/cross-chain/reviewedRoutes';
import { CROSS_CHAIN_DESTINATION_RETIRED, type CrossChainCallDestination } from '@/cross-chain/dappCrossChainCalls';
import { useI18n } from '@/locales/useI18n';
import { useNotify } from '@/plugins/soramitsuUI';
import { Components } from '@/router/routes';
import { useExtensionStore } from '@/stores/extension';
import { useNetworksStore } from '@/stores/networks';

const props = defineProps<{
  walletConnect?: boolean;
  approveWalletConnect?: (address: string, approvalId: string) => Promise<boolean>;
  rejectWalletConnect?: (approvalId: string) => Promise<boolean>;
}>();
const extensionStore = useExtensionStore();
const networksStore = useNetworksStore();
const router = useRouter();
const notify = useNotify();
const { t } = useI18n();
const wcRequest = computed(() => (props.walletConnect ? extensionStore.wcRequests[0] : undefined));
const wcReview = computed(() => (wcRequest.value ? walletConnectReview(wcRequest.value) : undefined));
const rejectTestId = computed(() => (props.walletConnect ? 'rejectWalletConnectSigning' : 'rejectSigning'));
const approveTestId = computed(() => (props.walletConnect ? 'approveWalletConnectSigning' : 'approveSigning'));
const request = computed<ReviewRequest | undefined>(() => {
  if (props.walletConnect) return wcReview.value?.request;
  const queues = extensionStore.signAllRequests;
  return queues.substrate[0] ?? Object.values(queues.evm)[0] ?? Object.values(queues.solana)[0];
});
const review = computed(() =>
  props.walletConnect
    ? wcReview.value?.review
    : request.value
      ? signingReview(request.value, networksStore.allNetworks)
      : undefined
);
const requestKey = computed(() =>
  request.value ? JSON.stringify([wcRequest.value, request.value, review.value]) : ''
);
const requester = computed(() => signingRequester(request.value?.url ?? ''));
const origin = computed(() => requester.value.origin);
const faviconUrl = computed(() => {
  try {
    const url = new URL(origin.value);
    return url.protocol === 'https:' ? `${url.origin}/favicon.ico` : '';
  } catch {
    return '';
  }
});
const faviconFailed = ref(false);
const isMobile = computed(() => request.value && 'isMobile' in request.value.account && request.value.account.isMobile);
const pending = ref<'approve' | 'reject' | null>(null);
const siteStatus = ref<'checking' | 'flagged' | 'unverified'>('checking');
const actionError = ref(false);
const actionErrorElement = ref<HTMLElement | null>(null);
const rawExpanded = ref(false);
const acknowledged = ref(false);
const highRiskAcknowledged = ref(false);
const REFUSAL_REASONS: Readonly<Record<RetiredDestinationCode, string>> = {
  'retired-chain': 'signingReview.crossChainReason.retiredChain',
  'sora-parachain-halted': 'signingReview.crossChainReason.soraParachainHalted',
  'sora-to-liberland-stalled': 'signingReview.crossChainReason.soraToLiberlandStalled',
  'asset-hub-migration': 'signingReview.crossChainReason.assetHubMigration',
};
const destinationLabel = ({ network, relay, paraId, raw }: CrossChainCallDestination): string => {
  const parachain =
    paraId === undefined
      ? ''
      : [relay, t('signingReview.crossChainParachain', { paraId: String(paraId) })].filter(Boolean).join(' · ');

  if (network) return parachain ? `${network} (${parachain})` : network;

  return parachain || raw || '';
};
const rawDetails = ref<HTMLDetailsElement | null>(null);
const controls = ref<HTMLElement | null>(null);
let active = true;
let renderedRequestKey = '';
let checkGeneration = 0;
const cannotApprove = computed(
  () =>
    !!pending.value ||
    siteStatus.value !== 'unverified' ||
    !review.value ||
    review.value.blocked ||
    (review.value.blind && (!rawExpanded.value || !acknowledged.value)) ||
    (review.value.highRisk && !highRiskAcknowledged.value)
);
const isRendered = () => active && !!request.value && renderedRequestKey === requestKey.value;
const onAcknowledge = (value: boolean) => {
  if (isRendered() && !pending.value) acknowledged.value = value;
};
const onHighRiskAcknowledge = (value: boolean) => {
  if (isRendered() && !pending.value) highRiskAcknowledged.value = value;
};
const onRawToggle = (event: Event) => {
  if (isRendered() && event.target === rawDetails.value) rawExpanded.value = rawDetails.value?.open ?? false;
};
const focusReject = async () => {
  const key = requestKey.value;
  await nextTick();
  if (active && key === requestKey.value)
    controls.value
      ?.querySelector<HTMLButtonElement>(`[data-testid="${rejectTestId.value}"] button`)
      ?.focus({ preventScroll: true });
};
const leaveEmpty = () => {
  const route = props.walletConnect ? Components.WalletConnectSignConfirmation : Components.Transaction;
  if (active && !request.value && router.currentRoute.value.name === route)
    void router.push({ name: Components.Wallet }).catch(() => {
      if (active) actionError.value = true;
    });
};
const checkSite = async () => {
  const generation = ++checkGeneration;
  const captured = request.value;
  siteStatus.value = 'checking';
  if (!captured) return;
  const verification = wcRequest.value?.verifyContext?.verified;
  if (verification?.isScam || verification?.validation === 'INVALID') {
    siteStatus.value = 'flagged';
    return;
  }
  let denied = false;
  try {
    denied = await checkIfDenied(captured.url);
  } catch {
    /* Unverified is not an assurance of trust. */
  }
  if (active && generation === checkGeneration) siteStatus.value = denied ? 'flagged' : 'unverified';
};
const act = async (action: 'approve' | 'reject') => {
  if (!isRendered() || pending.value || !request.value || (action === 'approve' && cannotApprove.value)) return;
  const { id } = request.value;
  // The queue of the request on screen: approving or rejecting it can only reach this request.
  const kind = signingRequestKind(request.value);
  const signer = request.value.account.address;
  const key = requestKey.value;
  const site = origin.value;
  const submits = review.value?.method === 'eth_sendTransaction' || review.value?.method === 'signAndSendTransaction';
  pending.value = action;
  actionError.value = false;
  try {
    if (action === 'reject') {
      if (props.walletConnect) {
        if (!(await props.rejectWalletConnect?.(id))) throw new Error('WalletConnect request was not rejected');
      } else await extensionStore.signCancel({ id, kind });
    } else {
      const signed = props.walletConnect
        ? await props.approveWalletConnect?.(signer, id)
        : await extensionStore.approveSign({ id, kind });
      if (props.walletConnect && !signed) throw new Error('WalletConnect request was not approved');
      if (signed)
        notify({
          title: t(submits ? 'signingReview.submitted' : 'signingReview.signed', { origin: site }),
          message: '',
          type: 'info',
        });
      else notify({ title: t('addWallet.google.somethingWrong'), message: '', type: 'error' });
    }
  } catch (error) {
    // The background refused a transfer to a destination that cannot deliver it, and the request is gone: say why.
    if (error instanceof Error && error.message.startsWith(CROSS_CHAIN_DESTINATION_RETIRED))
      notify({ title: t('signingReview.crossChainRefused'), message: '', type: 'error' });
    if (active && key === requestKey.value) {
      actionError.value = true;
      await nextTick();
      if (active && key === requestKey.value) actionErrorElement.value?.scrollIntoView?.({ block: 'nearest' });
    }
  } finally {
    if (active) {
      pending.value = null;
      if (key !== requestKey.value) void focusReject();
    }
  }
};
const onApprove = () => act('approve');
const onReject = () => act('reject');
watch(
  requestKey,
  () => {
    faviconFailed.value = false;
    rawExpanded.value = false;
    acknowledged.value = false;
    highRiskAcknowledged.value = false;
    actionError.value = false;
    void checkSite();
    leaveEmpty();
    void focusReject();
  },
  { flush: 'sync' }
);
watch(
  requestKey,
  (key) => {
    renderedRequestKey = key;
  },
  { flush: 'post' }
);
onMounted(() => {
  renderedRequestKey = requestKey.value;
  void checkSite();
  leaveEmpty();
  void focusReject();
});
onBeforeUnmount(() => {
  active = false;
  checkGeneration += 1;
});
</script>

<style lang="scss" scoped>
.signing-review {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 100%;
  text-align: left;
}
.signing-requester {
  display: flex;
  gap: 12px;
  align-items: start;
  padding: 16px;
  background: var(--fw-raised);
  border-radius: 16px;
  border: 1px solid var(--fw-stroke-control);
  > div {
    min-width: 0;
  }
  > svg {
    flex-shrink: 0;
  }
  p {
    margin: 0 0 8px;
    overflow-wrap: anywhere;
  }
}
.signing-origin,
.signing-method,
.signing-identifier,
.signing-fields dd[dir] {
  font-family: var(--fw-font-mono);
  unicode-bidi: isolate;
}
.signing-fallback {
  fill: none;
}
.signing-favicon {
  flex-shrink: 0;
  object-fit: contain;
  border-radius: 8px;
}
.signing-origin {
  color: var(--fw-text-2);
  strong {
    color: var(--fw-text-1);
    font-weight: 500;
  }
}
.signing-status {
  color: var(--fw-text-2);
}
.signing-status--flagged {
  color: var(--fw-danger);
}
.signing-action h2 {
  font-size: 1.125rem;
  margin: 0 0 12px;
}
.signing-action,
.signing-context {
  padding: 16px;
  border-radius: 16px;
  background: var(--fw-raised);
  border: 1px solid var(--fw-stroke-control);
}
.signing-fields {
  display: grid;
  gap: 8px;
  margin: 0;
  dt {
    color: var(--fw-text-2);
    font-weight: 700;
  }
  dd {
    margin: 0 0 8px;
    overflow-wrap: anywhere;
    min-width: 0;
  }
}
.signing-network {
  display: flex;
  align-items: center;
  gap: 8px;
  > svg {
    flex-shrink: 0;
  }
}
.signing-identifier {
  display: block;
  margin-top: 8px;
  overflow-wrap: anywhere;
}
.signing-amount {
  font-size: 1.5rem;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
.signing-message {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font: inherit;
  margin: 0;
  unicode-bidi: plaintext;
}
.signing-warning {
  border: 1px solid var(--fw-warning);
  border-radius: 12px;
  padding: 16px;
  color: var(--fw-text-1);
}
.signing-warning--danger,
.signing-action--danger {
  border-color: var(--fw-danger);
}
.signing-cross-chain {
  margin: 0 0 8px;
  font-weight: 700;
}
.signing-caution {
  color: var(--fw-text-2);
}
.signing-raw {
  min-width: 0;
  summary {
    min-height: 48px;
    box-sizing: border-box;
    padding: 12px;
    cursor: pointer;
  }
  summary:focus-visible {
    outline: 2px solid var(--fw-focus);
  }
  pre {
    max-height: 260px;
    overflow: auto;
    padding: 12px;
    margin: 0;
    font-family: var(--fw-font-mono);
    background: var(--fw-sunken);
    border-radius: 12px;
  }
}
.signing-controls {
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
