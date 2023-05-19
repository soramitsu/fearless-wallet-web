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

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { countryCodeEmoji } from 'country-code-emoji';
import { UNSUPPORTED_COUNTRIES } from '@/consts/soraCard';

@Component
export default class UnsupportedCountries extends Vue {
  readonly unsupportedCountries = Object.entries(UNSUPPORTED_COUNTRIES).map(([key, name]) => ({
    name,
    icon: countryCodeEmoji(key),
  }));

  get countriesLength() {
    return this.unsupportedCountries.length;
  }

  get midpoint() {
    return Math.ceil(this.countriesLength / 2);
  }

  get countriesPartOne() {
    return this.unsupportedCountries.slice(0, this.midpoint);
  }

  get countriesPartTwo() {
    return this.unsupportedCountries.slice(this.midpoint, this.countriesLength);
  }
}
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
        font-family: 'Twemoji Country Flags';
      }
    }
  }
}
</style>
