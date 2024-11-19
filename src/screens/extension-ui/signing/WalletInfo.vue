<template>
  <FCorners size="big">
    <div class="transaction__header">
      <Icon icon="wallet-logo-transaction" className="wallet__logo" />

      <div class="wallet-info__content">
        <span class="wallet__name">{{ cutName }}</span>

        <span class="wallet__address" @click="saveToClipboard">
          {{ cutAddress }}
        </span>
      </div>

      <Icon icon="clipboard" className="wallet-info__clipboard" @click="saveToClipboard" />
    </div>
  </FCorners>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { cut, setClipboard } from '@/helpers';

type Props = {
  address: string;
  name: string;
};
const props = defineProps<Props>();

const cutAddress = computed(() => cut(props.address, 14));
const cutName = computed(() => cut(props.name, 16));

function saveToClipboard() {
  setClipboard(props.address);
}
</script>

<style lang="scss" scoped>
.transaction__header {
  position: relative;
  background: $secondary-background-color;
  padding: 9px;
  border: 1px solid $default-background-color !important;
  clip-path: $big-clip-path-left-top-and-right-bottom;
  border-radius: $default-border-radius;
  width: 100%;
  display: flex;
  flex-flow: row;
  align-items: center;
  gap: 12px;
}

.network__badge-wrapper {
  position: absolute;
  right: 0;
  top: 0;
  clip-path: polygon(64% 0, 100% 0, 100% 22%, 80% 100%, 0 100%, 0 81%, 24% 0);
}

.network__badge {
  background: #7700ee;
  padding: 3px 28px 3px 28px;
  line-height: 18px;
  color: white;
}

.wallet-info__content {
  display: flex;
  flex-flow: column nowrap;
  align-items: flex-start;
  flex-grow: 1;
}

.wallet-info__address-container {
  display: flex;
  flex-flow: row nowrap;
  align-items: center;
  justify-content: center;
}

.wallet-info__clipboard {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.wallet-info__clipboard:hover {
  fill: #7700ee;
}

.wallet__name {
  font-size: 1.125em;
  font-weight: 700;
  line-height: 30px;
}

.wallet__address {
  font-size: 0.875em;
  max-width: 400px;
  overflow: hidden;
  cursor: pointer;
  color: $gray-color;
  text-overflow: ellipsis;
  margin-right: 14px;
}

.wallet__logo {
  width: 24px;
  height: 24px;
}
</style>
