<template>
  <div class="disclaimer">
    <span class="disclaimer-label">{{ $t('common.disclaimer') }}: </span>

    {{ $t('soraCard.disclaimerSoraCard') }}
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';

@Component
export default class Disclaimer extends Vue {}
</script>

<style scoped lang="scss">
.disclaimer {
  margin-top: 16px;
  text-align: left;
  font-size: 0.875em;
  padding: 0 16px;
  color: $gray-color;

  .disclaimer-label {
    color: $simple-orange-color;
  }
}
</style>
