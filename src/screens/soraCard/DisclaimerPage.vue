<template>
  <div class="introduction">
    <Alert headerText="common.disclaimer" message="soraCard.warningKYC" sizeText="small" />

    <div class="row">
      {{ $t('common.termsConditions') }}

      <CircleButton iconName="chevron-right" backgroundColor="none" @click="openDoc('terms')" />
    </div>
    <div class="row">
      {{ $t('common.privacyPolicy') }}

      <CircleButton iconName="chevron-right" backgroundColor="none" @click="openDoc('privacy')" />
    </div>
    <div class="row">
      {{ $t('soraCard.unsupportedCountries') }}

      <CircleButton iconName="chevron-right" backgroundColor="none" @click="openDoc('unsupportedCountries')" />
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { URLS } from '@/consts/urls';

@Component
export default class DisclaimerPage extends Vue {
  @Getter(AccountsGettersTypes.getFiatSymbol) fiatSymbol!: string;

  openDoc(value: 'terms' | 'privacy' | 'unsupportedCountries') {
    if (value === 'terms') window.open(URLS.SORA_CARD_TERMS);
    else if (value === 'privacy') window.open(URLS.SORA_CARD_PRIVACY);
    else this.$emit('toggleCountriesFormVisibility');
  }
}
</script>

<style scoped lang="scss">
.introduction {
  display: flex;
  flex-direction: column;
  justify-content: space-between;

  .row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 0;
    margin: 0 16px;
    border-bottom: 1px solid $default-background-color;
    color: $default-white;
  }

  .chevron-right {
    width: 18px;
    height: 18px;
    cursor: pointer;

    &:hover {
      color: $plain-white;
    }
  }
}
</style>
