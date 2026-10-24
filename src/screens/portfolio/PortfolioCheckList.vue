<template>
  <ul class="checks" data-testid="polkaswapChecks">
    <li v-for="item in items" :key="item.id" class="check" :data-testid="`check-${item.id}`" :data-ok="String(item.ok)">
      <!-- The glyph and the words say it; the colour only echoes them. -->
      <span class="mark" :class="markClass(item.ok)" aria-hidden="true">
        <Icon v-if="item.ok === true" icon="check" width="12px" height="12px" :hover="false" />
        <Icon v-else-if="item.ok === false" icon="close-thin" width="10px" height="10px" :hover="false" />
        <template v-else>&ndash;</template>
      </span>
      <span class="label">{{ t(`portfolioDashboard.where.card.checks.${item.id}`) }}</span>
      <span class="value">{{ valueText(item) }}</span>
    </li>
  </ul>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { PolkaswapCheck, PolkaswapCheckId } from '@/portfolio/dashboard/polkaswapChecks';
import { useI18n } from '@/locales/useI18n';

const props = defineProps<{
  checks: PolkaswapCheck[];
  /** Which checks to list, in order. */
  show: PolkaswapCheckId[];
  /** The wallet the unknown checks will be read in, when it is not the selected one. */
  unknownIn?: string;
}>();

const { t } = useI18n();

const items = computed(() => props.show.flatMap((id) => props.checks.filter((check) => check.id === id)));
const markClass = (ok: boolean | null): string => (ok === true ? 'mark--yes' : ok === false ? 'mark--no' : 'mark--unknown');

function valueText({ id, ok }: PolkaswapCheck): string {
  if (ok === null) return props.unknownIn ? t('portfolioDashboard.where.card.unknown', { wallet: props.unknownIn }) : '';
  if (id === 'moves' || id === 'swaps') return t(ok ? 'portfolioDashboard.where.card.on' : 'portfolioDashboard.where.card.off');

  return t(ok ? 'portfolioDashboard.where.card.yes' : 'portfolioDashboard.where.card.not');
}
</script>

<style lang="scss" scoped>
.checks {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.check {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  font-size: 0.78rem;
}

.mark {
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  border: 1px solid var(--fw-stroke-control);
  border-radius: 50%;
  font-size: 0.7rem;
  font-weight: 800;
}

.mark--yes {
  border-color: var(--fw-success);
  color: var(--fw-success);
}

.mark--no {
  border-style: dashed;
  color: var(--fw-text-2);
}

.mark--unknown {
  color: var(--fw-text-3);
}

.label {
  color: var(--fw-text-1);
  overflow-wrap: anywhere;
}

.value {
  color: var(--fw-text-2);
  font-weight: 600;
  text-align: right;
}
</style>
