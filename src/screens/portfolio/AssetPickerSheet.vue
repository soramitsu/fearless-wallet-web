<template>
  <!-- One sheet at a time: the network question takes the token list's place, and closing it brings the list back. -->
  <PortfolioSheet
    v-if="!networkPicker"
    :title="t(action === 'send' ? 'walletHome.picker.sendTitle' : 'walletHome.picker.receiveTitle')"
    testid="assetPicker"
    @close="$emit('close')"
  >
    <p class="hint">{{ t(action === 'send' ? 'walletHome.picker.sendHint' : 'walletHome.picker.receiveHint') }}</p>

    <SearchInput :value="query" width="100%" placeholder="walletHome.picker.search" class="search" @change="query = $event" />

    <ul v-if="rows.length" class="options" data-testid="assetPickerOptions">
      <li v-for="row in rows" :key="row.id">
        <button type="button" class="option" :data-token="row.id" :data-symbol="row.symbol" data-testid="assetPickerOption" @click="pick(row)">
          <span class="option-icon">
            <ExternalLogo :name="row.icon" :width="36" class="option-logo" />
            <span v-if="held(row).length > 1" class="option-count">{{ held(row).length }}</span>
            <ExternalLogo v-else :name="held(row)[0].asset.networkIcon" :width="14" class="option-badge" />
          </span>
          <span class="option-identity">
            <span class="option-symbol">{{ row.symbol }}</span>
            <span class="option-where">
              {{ held(row).length > 1 ? tc('walletHome.networks', held(row).length, { count: held(row).length }) : held(row)[0].asset.networkName }}
            </span>
          </span>
          <span v-if="row.balanceUnavailable" class="option-value option-value--failed">{{ t('portfolioPage.balanceStatus.failed') }}</span>
          <span v-else class="option-value">
            <span class="option-amount">{{ formatAmount(row.balanceText) }} {{ row.symbol }}</span>
            <span v-if="row.fiatValue !== null" class="option-fiat">{{ formatFiat(row.fiatValue) }}</span>
          </span>
        </button>
      </li>
    </ul>

    <div v-else class="empty" data-testid="assetPickerEmpty">
      <strong>{{ emptyTitle }}</strong>
      <span v-if="emptyHint">{{ emptyHint }}</span>
    </div>
  </PortfolioSheet>

  <!-- A token on several networks: the network is named before Send or Receive, with the warning (contract §7). -->
  <PortfolioGroupNetworkPicker
    v-else
    :action="action"
    :symbol="networkPicker.symbol"
    :options="networkPicker.options"
    @pick="open"
    @close="networkPicker = null"
  />
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { GroupNetworkOption, PortfolioTokenChild, PortfolioTokenRow } from '@/portfolio/tokenLens';
import PortfolioSheet from '@/screens/portfolio/PortfolioSheet.vue';
import PortfolioGroupNetworkPicker from '@/screens/wallet&asset/wallet/PortfolioGroupNetworkPicker.vue';
import { usePortfolioFormatting } from '@/portfolio/usePortfolioFormatting';
import { useWalletTokenRows } from '@/portfolio/useWalletTokenRows';
import { Components } from '@/router/routes';
import { useI18n } from '@/locales/useI18n';

const props = defineProps<{ action: 'send' | 'receive' }>();

const emit = defineEmits<{ (event: 'close'): void }>();

const router = useRouter();
const { t, tc } = useI18n();
const { formatAmount, formatFiat } = usePortfolioFormatting();
const query = ref('');
const networkPicker = ref<null | { symbol: string; options: GroupNetworkOption[] }>(null);
// A search reaches every verified asset, zero balances included, as the wallet list's search does.
const { tokenRows, sendOptions, receiveOptions } = useWalletTokenRows({ search: query });

const isGroup = (row: PortfolioTokenRow): boolean => row.children.length + row.zeroChildren.length > 1;
const held = (row: PortfolioTokenRow): PortfolioTokenChild[] => (row.children.length ? row.children : row.zeroChildren);
const optionsOf = (row: PortfolioTokenRow): GroupNetworkOption[] => (props.action === 'send' ? sendOptions(row) : receiveOptions(row));

// Send lists what can leave now; Receive lists every token the list shows, so a first deposit has somewhere to go.
const rows = computed(() => (props.action === 'send' ? tokenRows.value.filter((row) => sendOptions(row).length > 0) : tokenRows.value));

const emptyTitle = computed(() =>
  query.value.trim() || props.action === 'receive' ? t('walletHome.picker.noMatch') : t('walletHome.picker.emptySend')
);
const emptyHint = computed(() => (props.action === 'send' && !query.value.trim() ? t('walletHome.picker.emptySendHint') : ''));

function pick(row: PortfolioTokenRow): void {
  const options = optionsOf(row);

  // One network needs no question: it is named on the next screen. Several always ask, even if one is ready.
  if (!isGroup(row) && options.length === 1) {
    open(options[0]);
    return;
  }

  networkPicker.value = { symbol: row.symbol, options };
}

function open(option: GroupNetworkOption): void {
  networkPicker.value = null;
  emit('close');

  void router.push({
    name: props.action === 'send' ? Components.SendForm : Components.ReceiveForm,
    params: { assetId: option.assetId, network: option.networkName },
  });
}
</script>

<style lang="scss" scoped>
.hint {
  margin: 0;
  color: var(--fw-text-2);
  font-size: 0.8rem;
}

.search {
  width: 100%;

  // The sheet's hint says what the field is for; its label stays for screen readers only.
  :deep(.s-placeholder) {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
}

.options {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: 340px;
  overflow-y: auto;
}

.option {
  box-sizing: border-box;
  width: 100%;
  min-height: 56px;
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 8px 10px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;

  &:hover {
    background: var(--fw-raised-2);
  }

  &:focus-visible {
    outline: 2px solid var(--fw-focus);
    outline-offset: -2px;
  }
}

.option-icon {
  position: relative;
  width: 36px;
  height: 36px;
}

.option-logo {
  border-radius: 50%;
}

.option-badge {
  position: absolute;
  right: -3px;
  bottom: -3px;
  border: 2px solid var(--fw-raised);
  border-radius: 50%;
}

.option-count {
  position: absolute;
  right: -5px;
  bottom: -4px;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border: 2px solid var(--fw-raised);
  border-radius: 9px;
  background: var(--fw-raised-2);
  color: var(--fw-text-1);
  font-size: 0.6rem;
  font-weight: 700;
  line-height: 14px;
  text-align: center;
}

.option-identity,
.option-value {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.option-symbol {
  color: var(--fw-text-1);
  font-weight: 700;
}

.option-where,
.option-fiat {
  color: var(--fw-text-2);
  font-size: 0.72rem;
}

.option-where {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.option-value {
  align-items: flex-end;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.option-amount {
  color: var(--fw-text-1);
  font-size: 0.85rem;
  font-weight: 600;
}

.option-value--failed {
  color: var(--fw-warning);
  font-size: 0.75rem;
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 24px 8px;
  color: var(--fw-text-2);
  font-size: 0.8rem;
  text-align: center;

  strong {
    color: var(--fw-text-1);
  }
}
</style>
