<template>
  <div class="substrate-address-choice">
    <p class="choice-text" data-testid="substrateAddressChoiceDescription">{{ text('description') }}</p>

    <div class="choice-options" role="radiogroup" :aria-label="text('title')">
      <button
        v-for="candidate in candidates"
        :key="candidate.rule"
        class="choice-option"
        type="button"
        role="radio"
        :class="{ selected: candidate.rule === modelValue }"
        :aria-checked="candidate.rule === modelValue"
        :data-testid="`substrateAddress-${candidate.rule}`"
        @click="$emit('update:modelValue', candidate.rule)"
      >
        <strong>{{ text(candidate.rule) }}</strong>
        <span class="choice-address">{{ candidate.address }}</span>
        <span v-if="candidate.inWallet" class="choice-in-wallet" data-testid="substrateAddressInWallet">
          {{ text('inWallet') }}
        </span>
      </button>
    </div>

    <p class="choice-text" data-testid="substrateAddressHint">{{ text('hint') }}</p>
  </div>
</template>

<script lang="ts">
import { defineComponent, type PropType } from 'vue';

import type { SubstratePasswordAccountInfo } from '@extension-base/background/types/types';
import type { SubstratePasswordRule } from '@extension-base/services/keyring-service/SubstratePassword';
import { substratePasswordMessage, type SubstratePasswordMessageKey } from '@/locales/substratePassword';

export default defineComponent({
  name: 'SubstrateAddressChoice',
  props: {
    candidates: { type: Array as PropType<SubstratePasswordAccountInfo[]>, required: true },
    modelValue: { type: String as PropType<SubstratePasswordRule>, default: 'nfkd' },
  },
  emits: ['update:modelValue'],
  methods: {
    text(key: SubstratePasswordMessageKey) {
      return substratePasswordMessage(this.$i18n.locale, key);
    },
  },
});
</script>

<style lang="scss" scoped>
.substrate-address-choice {
  display: grid;
  gap: 12px;
  width: 100%;
}

.choice-text {
  margin: 0;
  font-size: 0.875rem;
  line-height: 1.5;
  color: $default-white;
}

.choice-options {
  display: grid;
  gap: 12px;
}

.choice-option {
  display: grid;
  gap: 6px;
  padding: 16px;
  border: $default-border;
  border-radius: 8px;
  background: $secondary-background-color;
  text-align: left;
  color: inherit;
  font: inherit;
  cursor: pointer;

  strong {
    font-size: 1rem;
  }

  span {
    font-size: 0.875rem;
    line-height: 1.5;
    color: $default-white;
  }

  .choice-address {
    font-family: monospace;
    overflow-wrap: anywhere;
    color: inherit;
  }

  .choice-in-wallet {
    color: $pink-lavender-color;
  }

  &:hover,
  &.selected {
    border-color: palette($pink-lavender-color, var(--fw-select-edge));
  }

  &.selected {
    box-shadow: inset 0 0 0 1px palette($pink-lavender-color, var(--fw-select-edge));
  }
}
</style>
