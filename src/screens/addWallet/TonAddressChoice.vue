<template>
  <div class="ton-address-choice">
    <p class="choice-text" data-testid="tonAddressChoiceDescription">{{ $t('ux.tonAddressChoiceDescription') }}</p>

    <div class="choice-options" role="radiogroup" :aria-label="$t('ux.tonAddressChoiceTitle')">
      <button
        v-for="candidate in candidates"
        :key="candidate.derivation"
        class="choice-option"
        type="button"
        role="radio"
        :class="{ selected: candidate.derivation === modelValue }"
        :aria-checked="candidate.derivation === modelValue"
        :data-testid="`tonAddress-${candidate.derivation}`"
        @click="$emit('update:modelValue', candidate.derivation)"
      >
        <strong>{{ $t(labels[candidate.derivation].title) }}</strong>
        <span>{{ $t(labels[candidate.derivation].description) }}</span>
        <span class="choice-address">{{ candidate.address }}</span>
        <span class="choice-activity" :data-activity="candidate.activity">{{ activityText(candidate) }}</span>
        <span v-if="candidate.inWallet" class="choice-in-wallet" data-testid="tonAddressInWallet">
          {{ $t('ux.tonAddressInWallet') }}
        </span>
      </button>
    </div>

    <p v-if="isUnchecked" class="choice-text" role="status" data-testid="tonAddressUnchecked">
      {{ $t('ux.tonAddressUnchecked') }}
    </p>
    <p class="choice-text" data-testid="tonAddressBothHint">{{ $t('ux.tonAddressBothHint') }}</p>
  </div>
</template>

<script lang="ts">
import { defineComponent, type PropType } from 'vue';

import type { TonImportCandidateInfo } from '@extension-base/background/types/types';
import type { TonImportDerivation } from '@/util/tonKeyring';
import { isTonImportUnchecked } from '@/screens/addWallet/tonImportChoice';

const labels: Record<TonImportDerivation, { title: string; description: string }> = {
  universal: { title: 'ux.tonAddressUniversal', description: 'ux.tonAddressUniversalDescription' },
  native: { title: 'ux.tonAddressNative', description: 'ux.tonAddressNativeDescription' },
  'fearless-legacy': { title: 'ux.tonAddressLegacy', description: 'ux.tonAddressLegacyDescription' },
  'as-typed': { title: 'ux.tonAddressAsTyped', description: 'ux.tonAddressAsTypedDescription' },
};

export default defineComponent({
  name: 'TonAddressChoice',
  props: {
    candidates: { type: Array as PropType<TonImportCandidateInfo[]>, required: true },
    modelValue: { type: String as PropType<TonImportDerivation | ''>, default: '' },
  },
  emits: ['update:modelValue'],
  data() {
    return { labels };
  },
  computed: {
    isUnchecked() {
      return isTonImportUnchecked(this.candidates);
    },
  },
  methods: {
    activityText({ activity, balance }: TonImportCandidateInfo) {
      if (activity === 'unknown' || balance === undefined) return this.$t('ux.tonAddressUnknown');

      return activity === 'active' ? this.$t('ux.tonAddressBalance', { amount: balance }) : this.$t('ux.tonAddressEmpty');
    },
  },
});
</script>

<style lang="scss" scoped>
.ton-address-choice {
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

  .choice-activity,
  .choice-in-wallet {
    color: $pink-lavender-color;
  }

  &:hover,
  &.selected {
    border-color: $pink-lavender-color;
  }

  &.selected {
    box-shadow: inset 0 0 0 1px $pink-lavender-color;
  }
}
</style>
