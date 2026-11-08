<template>
  <div class="manage-page" data-testid="manageAssets">
    <header class="manage-head">
      <h1 class="manage-title">{{ t('walletHome.manage.title') }}</h1>
      <p class="manage-intro">{{ t('walletHome.manage.intro') }}</p>
    </header>

    <AssetSearchField class="manage-search" :value="query" data-testid="manageSearch" @change="query = $event" />

    <!-- Some networks of this wallet have not answered yet: what it holds there will still show up on its own. -->
    <p v-if="checkingText" class="manage-status" role="status" data-testid="manageChecking">{{ checkingText }}</p>

    <p v-if="nothingMatches" class="manage-empty" role="status" data-testid="manageNoMatches">
      {{ t('walletHome.manage.noMatches', { query: searchQuery }) }}
    </p>

    <section v-if="view.wallet.length || !searching" class="manage-section" data-testid="manageShown" aria-labelledby="manage-shown">
      <h2 id="manage-shown" class="section-title">
        {{ t('walletHome.manage.shown') }} <span class="section-count">{{ view.wallet.length }}</span>
      </h2>
      <ManageAssetRow
        v-for="entry in view.wallet"
        :key="entry.asset.key"
        :entry="entry"
        section="wallet"
        @toggle="toggle(entry, 'wallet', $event)"
      />
      <p v-if="!view.wallet.length" class="section-empty">{{ t('walletHome.manage.shownEmpty') }}</p>
    </section>

    <section v-if="view.unverified.length" class="manage-section" data-testid="manageUnverified" aria-labelledby="manage-unverified">
      <h2 id="manage-unverified" class="section-title">
        {{ t('walletHome.manage.unverified') }} <span class="section-count">{{ view.unverified.length }}</span>
      </h2>
      <p class="section-hint">{{ t('walletHome.manage.unverifiedHint') }}</p>
      <ManageAssetRow
        v-for="entry in view.unverified"
        :key="entry.asset.key"
        :entry="entry"
        section="unverified"
        @toggle="toggle(entry, 'unverified', $event)"
      />
    </section>

    <section v-if="showsAddSection" class="manage-section" data-testid="manageAdd" aria-labelledby="manage-add">
      <h2 id="manage-add" class="section-title">
        {{ searching ? t('walletHome.manage.results') : t('walletHome.manage.popular') }}
      </h2>
      <ManageAssetRow
        v-for="entry in view.add"
        :key="entry.asset.key"
        :entry="entry"
        section="add"
        @toggle="toggle(entry, 'add', $event)"
      />
      <p v-if="searching && !view.add.length" class="section-empty">{{ t('walletHome.manage.noResults') }}</p>
      <p v-if="view.moreToAdd" class="section-hint" data-testid="manageMoreResults">
        {{ tc('walletHome.manage.moreResults', view.moreToAdd, { count: view.moreToAdd }) }}
      </p>
      <p v-if="!searching && otherAddable" class="section-hint" data-testid="manageSearchHint">
        {{ tc('walletHome.manage.searchHint', otherAddable, { count: otherAddable }) }}
      </p>
    </section>

    <section
      v-if="view.hidden.length"
      ref="hiddenSection"
      class="manage-section"
      data-testid="manageHidden"
      aria-labelledby="manage-hidden"
    >
      <h2 id="manage-hidden" class="section-title">
        {{ t('walletHome.manage.hidden') }} <span class="section-count">{{ view.hidden.length }}</span>
      </h2>
      <p class="section-hint">{{ t('walletHome.manage.hiddenHint') }}</p>
      <ManageAssetRow
        v-for="entry in view.hidden"
        :key="entry.asset.key"
        :entry="entry"
        section="hidden"
        @toggle="toggle(entry, 'hidden', $event)"
      />
    </section>

    <section v-if="!searching" class="manage-section manage-options" data-testid="manageOptions" aria-labelledby="manage-options">
      <h2 id="manage-options" class="section-title">{{ t('walletHome.manage.options') }}</h2>
      <div class="option">
        <span class="option-label">{{ t('walletHome.manage.showTestnets') }}</span>
        <Switcher
          :value="showTestnets"
          :ariaLabel="t('walletHome.manage.showTestnets')"
          data-testid="manageTestnets"
          @change="setShowTestnets"
        />
      </div>
      <!-- Only for wallets that ordered their assets in 3.0.5: that order is kept until Value is picked. -->
      <div v-if="showSortControl" class="option">
        <span class="option-label">{{ t('walletHome.manage.order') }}</span>
        <div class="segmented" role="group" :aria-label="t('portfolioPage.sort.label')" data-testid="portfolioSort">
          <button
            v-for="option in sortOptions"
            :key="option.value"
            type="button"
            class="segment"
            :aria-pressed="sort === option.value"
            :data-testid="`portfolioSort-${option.value}`"
            @click="setSort(option.value)"
          >
            {{ t(option.label) }}
          </button>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import ManageAssetRow from '@/screens/portfolio/ManageAssetRow.vue';
import AssetSearchField from '@/screens/wallet&asset/wallet/AssetSearchField.vue';
import { buildManageView, type ManageAssetEntry, type ManageSection } from '@/portfolio/manageAssets';
import { resolvePortfolioSort, type PortfolioSort } from '@/portfolio/portfolioViewSettings';
import { useManageAssets } from '@/portfolio/useManageAssets';
import { usePortfolio } from '@/portfolio/usePortfolio';
import { useI18n } from '@/locales/useI18n';
import { useAccountsStore } from '@/stores/accounts';

const props = withDefaults(
  defineProps<{
    /** `hidden` opens on the hidden assets (the list's "Review"); `search` puts the cursor in the search field. */
    focus?: string;
    /** Text to search for when the page opens, such as the network a filtered list showed nothing on. */
    search?: string;
  }>(),
  { focus: '', search: '' }
);

const { t, tc } = useI18n();
const accountsStore = useAccountsStore();
const portfolio = usePortfolio();
const { entries, setListed } = useManageAssets(portfolio);

const query = ref(props.search);
const searchQuery = computed(() => query.value.trim());
const searching = computed(() => Boolean(searchQuery.value));

// A row someone switched stays where it was until the search changes or the page opens again, so a switch never
// moves its row from under the pointer and a slip can be undone in place. Rows nobody switched go where they belong,
// so a balance that arrives meanwhile still moves its token up.
const switched = ref(new Map<string, ManageSection>());
watch([searchQuery, () => accountsStore.selectedWallet.address], () => (switched.value = new Map()));

function toggle(entry: ManageAssetEntry, shownIn: ManageSection, listed: boolean): void {
  if (!switched.value.has(entry.asset.key)) switched.value = new Map(switched.value).set(entry.asset.key, shownIn);
  setListed(entry.asset, listed);
}

const view = computed(() => buildManageView(entries.value, { query: searchQuery.value, placement: switched.value }));

const nothingMatches = computed(
  () =>
    searching.value && !view.value.wallet.length && !view.value.unverified.length && !view.value.add.length && !view.value.hidden.length
);
const showsAddSection = computed(() => (searching.value ? !nothingMatches.value : view.value.add.length > 0 || otherAddable.value > 0));
// Tokens a search would find beyond the suggestions on screen.
const otherAddable = computed(() => Math.max(0, view.value.addableCount - view.value.add.length));

const checkingText = computed(() => {
  const { state, pendingCount } = portfolio.loadStatus.value;

  return state !== 'settled' && pendingCount > 0 ? tc('portfolioPage.checkingNetworks', pendingCount, { count: pendingCount }) : '';
});

const showTestnets = computed(() => accountsStore.portfolioView.showTestnets);

function setShowTestnets(value: boolean): void {
  accountsStore.updatePortfolioView({ showTestnets: value });
}

const sortOptions: { value: PortfolioSort; label: string }[] = [
  { value: 'value', label: 'portfolioPage.sort.value' },
  { value: 'custom', label: 'portfolioPage.sort.custom' },
];
const showSortControl = computed(() => portfolio.legacyOrderIndex.value.size > 0);
const sort = computed(() => resolvePortfolioSort(accountsStore.portfolioView, showSortControl.value));

function setSort(value: PortfolioSort): void {
  accountsStore.updatePortfolioView({ sort: value });
}

// "Review" opens the page on the hidden assets; they may arrive a moment later than the page.
const hiddenSection = ref<HTMLElement | null>(null);
let hiddenShown = false;

function showHiddenSection(): void {
  if (hiddenShown || props.focus !== 'hidden' || !hiddenSection.value) return;

  hiddenShown = true;
  hiddenSection.value.scrollIntoView?.({ block: 'start' });
}

watch(hiddenSection, () => void nextTick(showHiddenSection));

onMounted(() => {
  showHiddenSection();
  if (props.focus === 'search') document.querySelector<HTMLInputElement>('.manage-search input')?.focus();
});
</script>

<style lang="scss" scoped>
.manage-page {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
  text-align: left;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 4px 4px 24px;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-thumb {
    background-color: var(--fw-stroke-strong);
    border-radius: $default-border-radius;
  }
}

.manage-head {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.manage-title {
  margin: 0;
  color: var(--fw-text-1);
  font-size: 1.15rem;
  font-weight: 700;
}

.manage-intro {
  margin: 0;
  color: var(--fw-text-2);
  font-size: 0.78rem;
  line-height: 1.4;
}

.manage-status,
.manage-empty {
  margin: 0;
  color: var(--fw-text-2);
  font-size: 0.75rem;
}

.manage-empty {
  padding: 16px 0;
  text-align: center;
}

.manage-section {
  display: flex;
  flex-direction: column;
  padding: 10px 12px 6px;
  border: 1px solid var(--fw-divider);
  border-radius: 12px;
  background: var(--fw-raised);
}

.section-title {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin: 0 0 4px;
  color: var(--fw-text-1);
  font-size: 0.82rem;
  font-weight: 700;
}

.section-count {
  color: var(--fw-text-3);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.section-hint,
.section-empty {
  margin: 0 0 6px;
  color: var(--fw-text-2);
  font-size: 0.72rem;
  line-height: 1.35;
}

.section-empty {
  padding: 8px 0;
}

.option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 48px;
  border-top: 1px solid var(--fw-divider);

  &:first-of-type {
    border-top: 0;
  }
}

.option-label {
  color: var(--fw-text-1);
  font-size: 0.8rem;
}

.segmented {
  display: inline-flex;
  padding: 2px;
  border: $default-border;
  border-radius: 16px;
  background: $secondary-background-color;
}

.segment {
  min-height: 28px;
  padding: 0 12px;
  border: 0;
  border-radius: 14px;
  background: transparent;
  color: $grayish-white;
  font: inherit;
  font-size: 0.72rem;
  cursor: pointer;
  white-space: nowrap;

  &[aria-pressed='true'] {
    background: $pink-purple-color;
    color: $plain-white;
    font-weight: 700;
  }

  &:focus-visible {
    outline: 2px solid palette($pink-lavender-color, var(--fw-focus));
    outline-offset: 1px;
  }
}
</style>
