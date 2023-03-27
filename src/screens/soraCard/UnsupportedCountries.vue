<template>
  <Scroll>
    <div class="countries-list">
      <div class="countries-column">
        <div v-for="{ name, icon } in countriesPartOne" :key="name" class="country">
          <Icon v-if="icon" :icon="icon" class="flag" />

          {{ name }}
        </div>
      </div>

      <div class="countries-column">
        <div v-for="{ name, icon } in countriesPartTwo" :key="name" class="country">
          <Icon v-if="icon" :icon="icon" class="flag" />

          {{ name }}
        </div>
      </div>
    </div>
  </Scroll>
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
.countries-list {
  display: flex;
  justify-content: space-around;

  .countries-column {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: flex-start;

    .flag {
      height: 15px;
      width: 15px;
    }

    .country {
      padding: 8px;
      color: $default-white;
    }
  }
}
</style>
