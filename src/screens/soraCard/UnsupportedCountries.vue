<template>
  <div class="countries">
    <div class="label">
      {{ $t('soraCard.countriesLabel') }}
    </div>

    <Scroll>
      <ul class="countries-list">
        <li v-for="{ name, icon } in unsupportedCountries" :key="name" class="country">
          <span class="flag">{{ icon }}</span>

          {{ name }}
        </li>
      </ul>
    </Scroll>
  </div>
</template>

<script lang="ts" setup>
import { countryCodeEmoji } from 'country-code-emoji';
import { UNSUPPORTED_COUNTRIES } from '@/consts/soraCard';

const unsupportedCountries = Object.entries(UNSUPPORTED_COUNTRIES).map(([key, name]) => ({
  name,
  icon: countryCodeEmoji(key),
}));
</script>

<style scoped lang="scss">
.countries {
  color: $default-white;

  .label {
    font-weight: 600;
    text-align: left;
  }

  .countries-list {
    display: grid;
    grid-template-columns: 1fr 1fr;
    padding: 0;

    .country {
      display: flex;
      align-items: center;
      padding: 8px 8px 8px 0;

      .flag {
        margin-right: 10px;
        font-family: 'Twemoji Country Flags', sans-serif;
      }
    }
  }
}
</style>
