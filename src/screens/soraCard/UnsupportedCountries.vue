<template>
  <div class="countries">
    <div class="label">
      {{ $t('soraCard.countriesLabel') }}
    </div>

    <Scroll>
      <div class="countries-list">
        <div class="countries-column">
          <div v-for="{ name, icon } in countriesPartOne" :key="name" class="country">
            <Icon :icon="icon" class="flag" />

            {{ name }}
          </div>
        </div>

        <div class="countries-column">
          <div v-for="{ name, icon } in countriesPartTwo" :key="name" class="country">
            <Icon :icon="icon" class="flag" />

            {{ name }}
          </div>
        </div>
      </div>
    </Scroll>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { UNSUPPORTED_COUNTRIES } from '@/consts/soraCard';

@Component
export default class UnsupportedCountries extends Vue {
  readonly unsupportedCountries = UNSUPPORTED_COUNTRIES;

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
    display: flex;

    .countries-column {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      align-items: flex-start;
      min-width: 250px;

      .flag {
        height: 18px;
        width: 18px;
        margin-right: 10px;
      }

      .country {
        display: flex;
        align-items: center;
        padding: 8px 8px 8px 0;
      }
    }
  }
}
</style>
