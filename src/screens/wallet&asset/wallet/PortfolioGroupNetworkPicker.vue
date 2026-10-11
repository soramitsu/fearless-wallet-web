<template>
  <!-- Above the whole popup: the portfolio list clips and scrolls, a sheet inside it would be cut off. -->
  <Teleport to="body">
  <div class="picker-backdrop" data-testid="groupNetworkPickerBackdrop" @click.self="$emit('close')">
    <section
      ref="dialog"
      class="picker"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="titleId"
      tabindex="-1"
      data-testid="groupNetworkPicker"
      @keydown.esc.stop="$emit('close')"
    >
      <header class="picker-header">
        <h2 :id="titleId" class="picker-title">
          {{ t(action === 'send' ? 'portfolioPage.groupPicker.sendTitle' : 'portfolioPage.groupPicker.receiveTitle', { symbol }) }}
        </h2>
        <button type="button" class="picker-close" :aria-label="t('common.close')" data-testid="groupNetworkPickerClose" @click="$emit('close')">
          <Icon icon="close" width="20px" height="20px" :hover="false" />
        </button>
      </header>

      <p class="picker-warning" data-testid="groupNetworkWarning">
        {{ t(action === 'send' ? 'portfolioPage.groupPicker.sendWarning' : 'portfolioPage.groupPicker.receiveWarning', { symbol }) }}
      </p>

      <ul v-if="options.length" class="picker-options">
        <li v-for="option in options" :key="option.key">
          <button type="button" class="picker-option" data-testid="groupNetworkOption" :data-network="option.networkName" @click="$emit('pick', option)">
            <ExternalLogo :name="option.networkIcon" :width="28" class="option-logo" />
            <span class="option-identity">
              <span class="option-label">{{ symbol }} · {{ option.networkName }}</span>
              <span v-if="roleLabel(option.role)" class="role-chip">{{ roleLabel(option.role) }}</span>
            </span>
            <span v-if="option.amountText !== undefined" class="option-amount">{{ formatAmount(option.amountText) }} {{ symbol }}</span>
          </button>
        </li>
      </ul>

      <p v-else class="picker-empty" data-testid="groupNetworkPickerEmpty">
        {{ t('portfolioPage.groupPicker.noSendNetwork', { symbol }) }}
      </p>
    </section>
  </div>
  </Teleport>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import type { GroupNetworkOption } from '@/portfolio/tokenLens';
import { usePortfolioFormatting } from '@/portfolio/usePortfolioFormatting';
import { useI18n } from '@/locales/useI18n';

defineProps<{
  action: 'send' | 'receive';
  symbol: string;
  /** Nothing is preselected: the user always names the network (portfolio contract §7). */
  options: GroupNetworkOption[];
}>();

defineEmits<{ (event: 'pick', option: GroupNetworkOption): void; (event: 'close'): void }>();

const { t } = useI18n();
const { formatAmount, roleLabel } = usePortfolioFormatting();
const dialog = ref<HTMLElement>();
const titleId = `group-network-picker-${Math.random().toString(36).slice(2, 8)}`;

// Focus moves into the sheet and back to the Send or Receive button that opened it.
const opener = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;

onMounted(() => dialog.value?.focus());
onBeforeUnmount(() => opener?.focus());
</script>

<style lang="scss" scoped>
.picker-backdrop {
  position: fixed;
  inset: 0;
  z-index: 300;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(5px);
}

.picker {
  width: min(100%, 480px);
  max-height: calc(100% - 32px);
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow: auto;
  padding: 16px;
  border: 1px solid rgba(187, 119, 255, 0.45);
  border-radius: $default-border-radius;
  background: #111111;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
  // Teleported out of the app: set what the app would otherwise pass down.
  color: $plain-white;
  font-family: var(--s-font-family-default, inherit);
  text-align: left;

  &:focus {
    outline: none;
  }
}

.picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.picker-title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.picker-close {
  flex: none;
  border: 0;
  padding: 4px;
  background: transparent;
  color: $grayish-white;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid $pink-lavender-color;
    outline-offset: 2px;
  }
}

.picker-warning {
  margin: 0;
  padding: 10px 12px;
  border-radius: $default-border-radius;
  background: $pink-purple-color;
  color: $grayish-white;
  font-size: 0.74rem;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.picker-options {
  margin: 0;
  padding: 0;
  list-style: none;
}

.picker-option {
  width: 100%;
  min-height: 52px;
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border: 0;
  border-top: $default-border;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;

  &:hover {
    background: rgba(187, 119, 255, 0.08);
  }

  &:focus-visible {
    outline: 2px solid $pink-lavender-color;
    outline-offset: 2px;
  }
}

.option-logo {
  border-radius: 50%;
}

.option-identity {
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}

.option-label {
  font-weight: 700;
  overflow-wrap: anywhere;
}

.role-chip {
  padding: 1px 6px;
  border: 1px solid rgba(187, 119, 255, 0.45);
  border-radius: 8px;
  color: $pink-lavender-color;
  font-size: 0.6rem;
  font-weight: 600;
  line-height: 1.5;
}

.option-amount {
  color: $grayish-white;
  font-size: 0.75rem;
  text-align: right;
  overflow-wrap: anywhere;
}

.picker-empty {
  margin: 0;
  color: $gray-color;
  font-size: 0.78rem;
}
</style>
