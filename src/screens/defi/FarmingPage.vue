<template>
  <div class="farming-page">
    <header class="workspace-header">
      <div>
        <h1>{{ t('farmingPage.title') }}</h1>
        <p>{{ t('farmingPage.subtitle') }}</p>
      </div>
      <button type="button" class="refresh" :disabled="loading" @click="loadPools">
        {{ t('farmingPage.refresh') }}
      </button>
    </header>

    <ContentForm :height="contentHeight">
      <Scroll>
        <Loader v-if="loading" class="loading" />

        <div v-else-if="!catalog?.available" class="capability-state">
          <Icon icon="info" className="state-icon" :hover="false" />
          <strong>{{ t('farmingPage.unavailable') }}</strong>
          <span>{{ t('farmingPage.fallback.catalog') }}</span>
        </div>

        <template v-else>
          <div v-if="!catalog.canSign" class="signing-state">
            <strong>{{ t('farmingPage.browseOnly') }}</strong>
            <span>{{ t('farmingPage.fallback.signing') }}</span>
          </div>

          <section class="pool-section">
            <div class="section-title">
              <span>{{ t('farmingPage.yourPositions') }}</span>
              <small>{{ positions.length }}</small>
            </div>
            <p v-if="!positions.length" class="empty-copy">{{ t('farmingPage.positionsEmpty') }}</p>
            <PoolCard v-for="pool in positions" :key="`position-${pool.key}`" :pool="pool" position />
          </section>

          <section class="pool-section">
            <div class="section-title">
              <span>{{ t('farmingPage.farmingPools') }}</span>
              <small>{{ activePools.length }}</small>
            </div>
            <p v-if="!activePools.length" class="empty-copy">{{ t('farmingPage.poolsEmpty') }}</p>
            <PoolCard v-for="pool in activePools" :key="pool.key" :pool="pool" />
          </section>
        </template>
      </Scroll>
    </ContentForm>

    <Popup
      v-if="selectedPool && selectedOperation"
      sizeWidth="big"
      :headerText="reviewing ? 'farmingPage.confirmation' : actionTitleKey"
      @handlerClose="closeAction"
    >
      <div class="action-form">
        <template v-if="!reviewing">
          <div class="action-pair">
            <strong>{{ selectedPool.baseAsset.symbol }} / {{ selectedPool.poolAsset.symbol }}</strong>
            <span>{{ t('farmingPage.rewardsIn', { asset: selectedPool.rewardAsset.symbol }) }}</span>
          </div>
          <label v-if="selectedOperation !== 'claim'">
            <span>{{ t('farmingPage.amount') }}</span>
            <input v-model.trim="amount" inputmode="decimal" autocomplete="off" placeholder="0" />
          </label>
          <div v-else class="claim-amount">
            <span>{{ t('farmingPage.claimable') }}</span>
            <strong>{{ selectedPool.earnedRewards }} {{ selectedPool.rewardAsset.symbol }}</strong>
          </div>
          <p v-if="formError" class="form-error">{{ formError }}</p>
          <FButton width="100%" size="big" text="farmingPage.review" :disabled="!canReview" @click="reviewing = true" />
        </template>

        <template v-else>
          <dl class="review-lines">
            <div>
              <dt>{{ t('farmingPage.network') }}</dt>
              <dd>SORA</dd>
            </div>
            <div>
              <dt>{{ t('farmingPage.action') }}</dt>
              <dd>{{ t(actionTitleKey) }}</dd>
            </div>
            <div v-if="selectedOperation !== 'claim'">
              <dt>{{ t('farmingPage.amount') }}</dt>
              <dd>{{ amount }}</dd>
            </div>
            <div>
              <dt>{{ t('farmingPage.networkFee') }}</dt>
              <dd>{{ selectedFee }} XOR</dd>
            </div>
            <div v-if="selectedOperation === 'deposit'">
              <dt>{{ t('farmingPage.poolDepositFee') }}</dt>
              <dd>{{ depositFee }}</dd>
            </div>
          </dl>
          <p v-if="formError" class="form-error">{{ formError }}</p>
          <FButton
            width="100%"
            size="big"
            :text="pending ? 'farmingPage.submitting' : 'farmingPage.confirm'"
            :disabled="pending"
            @click="confirmAction"
          />
          <button type="button" class="back-action" :disabled="pending" @click="reviewing = false">
            {{ t('farmingPage.back') }}
          </button>
        </template>
      </div>
    </Popup>
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import BigNumber from 'bignumber.js';
import type {
  DemeterOperation,
  DemeterPoolView,
  DemeterPoolsResponse,
} from '@extension-base/services/pools-service/types';
import { CONTENT_FORM_HEIGHT } from '@/consts/global';
import { getDemeterPools, mutateDemeter } from '@/extension/messaging';
import { useI18n } from '@/locales/useI18n';

const { t } = useI18n();
const route = useRoute();
const positionElements = new Map<string, HTMLElement>();
const contentHeight = CONTENT_FORM_HEIGHT;
const loading = ref(true);
const catalog = ref<DemeterPoolsResponse | null>(null);
const selectedPool = ref<DemeterPoolView | null>(null);
const selectedOperation = ref<DemeterOperation | null>(null);
const amount = ref('');
const reviewing = ref(false);
const pending = ref(false);
const formError = ref('');

const positions = computed(
  () =>
    catalog.value?.pools.filter(
      (pool) => new BigNumber(pool.pooledTokens).gt(0) || new BigNumber(pool.earnedRewards).gt(0)
    ) ?? []
);
const activePools = computed(() => catalog.value?.pools.filter((pool) => !pool.isRemoved) ?? []);
const actionTitleKey = computed(() => {
  if (selectedOperation.value === 'deposit') return 'farmingPage.actionTitle.depositLp';
  if (selectedOperation.value === 'withdraw') return 'farmingPage.actionTitle.withdrawLp';
  return 'farmingPage.actionTitle.claimRewards';
});
const selectedFee = computed(() =>
  selectedOperation.value ? (catalog.value?.fees[selectedOperation.value] ?? '0') : '0'
);
const depositFee = computed(() => `${Number(selectedPool.value?.depositFee ?? 0) * 100}%`);
const canReview = computed(() => {
  if (!catalog.value?.canSign || !selectedOperation.value) return false;
  if (selectedOperation.value === 'claim') return selectedPool.value?.earnedRewards !== '0';
  return /^(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(amount.value) && Number(amount.value) > 0;
});

const PoolCard = defineComponent({
  props: {
    pool: { type: Object as () => DemeterPoolView, required: true },
    position: Boolean,
  },
  setup(props) {
    const metric = (label: string, value: string) =>
      h('span', { class: 'metric' }, [h('small', label), h('strong', value)]);
    return () =>
      h(
        'article',
        {
          class: ['pool-card', { removed: props.pool.isRemoved }],
          tabindex: props.position ? -1 : undefined,
          ref: (element: unknown) => {
            if (!props.position) return;
            if (element instanceof HTMLElement) positionElements.set(props.pool.key, element);
            else positionElements.delete(props.pool.key);
          },
          'data-position-key': props.position ? props.pool.key : undefined,
        },
        [
          h('div', { class: 'pool-heading' }, [
            h('span', { class: 'pool-symbols' }, `${props.pool.baseAsset.symbol} / ${props.pool.poolAsset.symbol}`),
            h('small', t('farmingPage.earnOnSora', { asset: props.pool.rewardAsset.symbol })),
          ]),
          h('div', { class: 'metrics' }, [
            metric('APR', props.pool.apr === null ? t('farmingPage.unavailableValue') : `${props.pool.apr}%`),
            metric('TVL', props.pool.tvl === null ? t('farmingPage.unavailableValue') : props.pool.tvl),
            metric(t('farmingPage.depositFee'), `${Number(props.pool.depositFee) * 100}%`),
          ]),
          props.position
            ? h('div', { class: 'position-values' }, [
                metric(t('farmingPage.depositedLp'), props.pool.pooledTokens),
                metric(
                  t('farmingPage.earnedAsset', { asset: props.pool.rewardAsset.symbol }),
                  props.pool.earnedRewards
                ),
              ])
            : null,
          h('div', { class: 'pool-actions' }, [
            h(
              'button',
              {
                type: 'button',
                disabled: !catalog.value?.canSign || props.pool.isRemoved,
                onClick: () => openAction(props.pool, 'deposit'),
              },
              t('farmingPage.deposit')
            ),
            props.position
              ? h(
                  'button',
                  {
                    type: 'button',
                    disabled: !catalog.value?.canSign || props.pool.pooledTokens === '0',
                    onClick: () => openAction(props.pool, 'withdraw'),
                  },
                  t('farmingPage.withdraw')
                )
              : null,
            props.position
              ? h(
                  'button',
                  {
                    type: 'button',
                    disabled: !catalog.value?.canSign || props.pool.earnedRewards === '0',
                    onClick: () => openAction(props.pool, 'claim'),
                  },
                  t('farmingPage.claim')
                )
              : null,
          ]),
        ]
      );
  },
});

async function loadPools(): Promise<void> {
  loading.value = true;
  try {
    catalog.value = await getDemeterPools();
  } catch {
    catalog.value = null;
  } finally {
    loading.value = false;
  }
}

function openAction(pool: DemeterPoolView, operation: DemeterOperation): void {
  selectedPool.value = pool;
  selectedOperation.value = operation;
  amount.value = '';
  formError.value = '';
  reviewing.value = false;
}

function closeAction(): void {
  if (pending.value) return;
  selectedPool.value = null;
  selectedOperation.value = null;
}

async function confirmAction(): Promise<void> {
  const pool = selectedPool.value;
  const operation = selectedOperation.value;
  if (!pool || !operation || pending.value) return;
  pending.value = true;
  formError.value = '';

  try {
    const result = await mutateDemeter({
      operation,
      pool: {
        key: pool.key,
        isFarm: pool.isFarm,
        baseAssetId: pool.baseAsset.id,
        poolAssetId: pool.poolAsset.id,
        rewardAssetId: pool.rewardAsset.id,
      },
      amount: operation === 'claim' ? undefined : amount.value,
      expectedFee: selectedFee.value,
    });

    if (!result.status) {
      formError.value = t('farmingPage.fallback.transaction');
      return;
    }

    selectedPool.value = null;
    selectedOperation.value = null;
    await loadPools();
  } catch {
    formError.value = t('farmingPage.fallback.transaction');
  } finally {
    pending.value = false;
  }
}

async function focusLinkedPosition(): Promise<void> {
  await nextTick();
  const key = typeof route.query.position === 'string' ? route.query.position : '';
  const element = positionElements.get(key);
  if (!element) return;
  element.focus({ preventScroll: true });
  element.scrollIntoView({ block: 'nearest', behavior: 'instant' });
}
watch([loading, () => route.query.position], () => {
  if (!loading.value) void focusLinkedPosition();
});
onMounted(loadPools);
</script>

<style lang="scss" scoped>
.farming-page {
  display: flex;
  min-height: 0;
  flex-direction: column;
}
.workspace-header {
  min-height: 56px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 8px;
  text-align: left;
}
.workspace-header h1 {
  margin: 0;
  font-size: 1.35rem;
}
.workspace-header p {
  margin: 4px 0 0;
  color: $gray-color;
  font-size: 0.72rem;
}
.refresh,
.back-action {
  border: 0;
  background: transparent;
  color: $pink-lavender-color;
  cursor: pointer;
  font: inherit;
}
.loading,
.capability-state {
  min-height: 260px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.capability-state {
  flex-direction: column;
  gap: 8px;
  padding: 24px;
  color: $gray-color;
  text-align: center;
}
.capability-state strong {
  color: $plain-white;
}
.state-icon {
  width: 26px;
}
.signing-state {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 14px 16px 0;
  padding: 12px;
  border: $default-border;
  border-radius: 8px;
  text-align: left;
}
.signing-state span,
.empty-copy {
  color: $gray-color;
  font-size: 0.72rem;
}
.pool-section {
  padding: 16px;
  text-align: left;
}
.pool-section + .pool-section {
  border-top: $default-border;
}
.section-title {
  display: flex;
  justify-content: space-between;
  color: $gray-color;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.pool-card {
  margin-top: 10px;
  padding: 14px 0 4px;
  border-top: $default-border;
}
.pool-card:focus {
  outline: 2px solid $pink-color;
  outline-offset: 4px;
}
.pool-card.removed {
  opacity: 0.7;
}
.pool-heading {
  display: flex;
  flex-direction: column;
}
.pool-heading small {
  margin-top: 3px;
  color: $gray-color;
}
.pool-symbols {
  font-size: 0.95rem;
  font-weight: 700;
}
.metrics,
.position-values {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 12px;
}
.position-values {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.metric {
  display: flex;
  min-width: 0;
  flex-direction: column;
}
.metric small {
  color: $gray-color;
  font-size: 0.64rem;
}
.metric strong {
  margin-top: 3px;
  overflow: hidden;
  font-size: 0.72rem;
  text-overflow: ellipsis;
}
.pool-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
.pool-actions button {
  border: 0;
  border-radius: 14px;
  padding: 6px 10px;
  background: $default-background-color;
  color: $pink-lavender-color;
  cursor: pointer;
  font: inherit;
  font-size: 0.68rem;
  font-weight: 700;
}
.pool-actions button:disabled {
  color: $gray-color;
  cursor: default;
}
.action-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 8px 24px 24px;
  text-align: left;
}
.action-pair,
.claim-amount {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.action-pair span,
.claim-amount span {
  color: $gray-color;
  font-size: 0.72rem;
}
.action-form label {
  display: flex;
  flex-direction: column;
  gap: 7px;
  color: $gray-color;
  font-size: 0.7rem;
  text-transform: uppercase;
}
.action-form input {
  min-height: 44px;
  padding: 0 12px;
  border: $default-border;
  border-radius: 8px;
  background: $default-background-color;
  color: $plain-white;
  font: inherit;
}
.review-lines {
  margin: 0;
}
.review-lines div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 0;
  border-bottom: $default-border;
}
.review-lines dt {
  color: $gray-color;
}
.review-lines dd {
  margin: 0;
  text-align: right;
}
.form-error {
  margin: 0;
  color: $reject-color;
  font-size: 0.72rem;
}
.back-action {
  align-self: center;
}
</style>
