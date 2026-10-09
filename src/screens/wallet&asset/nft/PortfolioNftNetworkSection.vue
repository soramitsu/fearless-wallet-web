<template>
  <section class="nft-network-section" :data-network="section.name">
    <button class="network-header" type="button" :aria-expanded="expanded" @click="expanded = !expanded">
      <ExternalLogo :name="section.icon" :width="34" class="network-icon" />

      <span class="network-identity">
        <span class="network-title">{{ section.name }}</span>
        <span class="network-meta">{{ ecosystemLabel }} · {{ shortAddress }}</span>
      </span>

      <span class="network-status">
        <span>{{ tc('portfolioPage.collectionCount', section.collections.length, { count: section.collections.length }) }}</span>
        <span class="sync-state">{{ syncLabel }}</span>
      </span>

      <Icon :icon="expanded ? 'down' : 'chevron-right'" className="chevron" :hover="false" />
    </button>

    <div v-if="expanded" class="collection-grid">
      <NftCollectionItem
        v-for="collection in visibleCollections"
        :key="collection.key"
        :collection="collection"
        :chainId="section.chainId"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { PortfolioNftNetworkSection } from '@/portfolio/nftIdentity';
import NftCollectionItem from '@/screens/wallet&asset/nft/NftCollectionItem.vue';
import { useI18n } from '@/locales/useI18n';

const props = defineProps<{ section: PortfolioNftNetworkSection; search?: string }>();
const { t, tc } = useI18n();
const expanded = ref(true);

const ecosystemLabel = computed(() => {
  const value = props.section.ecosystem;

  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : t('portfolioPage.unknownNetwork');
});

const shortAddress = computed(() => {
  const value = props.section.address;

  if (!value) return t('portfolioPage.noAccount');
  if (value.length < 15) return value;

  return `${value.slice(0, 6)}…${value.slice(-5)}`;
});

const syncLabel = computed(() => {
  if (props.section.stale) return t('portfolioPage.sync.stale');
  if (!props.section.latestTimestamp) return t('portfolioPage.sync.pending');

  return Date.now() - props.section.latestTimestamp > 15 * 60 * 1000
    ? t('portfolioPage.sync.stale')
    : t('portfolioPage.sync.synced');
});

const visibleCollections = computed(() => {
  const search = props.search?.trim().toLowerCase() ?? '';

  if (!search || props.section.name.toLowerCase().includes(search)) return props.section.collections;

  return props.section.collections.filter((collection) =>
    `${collection.name ?? ''} ${collection.address}`.toLowerCase().includes(search)
  );
});
</script>

<style lang="scss" scoped>
.nft-network-section {
  margin-right: 16px;
  border-bottom: $default-border;
}

.network-header {
  width: 100%;
  min-height: 68px;
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) auto 16px;
  align-items: center;
  gap: 10px;
  padding: 12px 0;
  border: 0;
  color: inherit;
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.network-identity,
.network-status {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.network-title {
  font-weight: 700;
}

.network-meta,
.sync-state {
  margin-top: 4px;
  color: $gray-color;
  font-size: 0.7rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.network-status {
  align-items: flex-end;
  text-align: right;
  white-space: nowrap;
}

.network-icon {
  border-radius: 50%;
}

.collection-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  padding: 8px 0 18px;
}

.chevron {
  color: $gray-color;
}
</style>
