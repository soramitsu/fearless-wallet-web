<template>
  <ExternalWidget v-if="link" :src="link" backgroundColor="polkaswap" withBorder />

  <div v-else class="terms-conditions">
    <div>
      <Alert headerText="common.disclaimer" message="soraCard.warningKYC" sizeText="small" />

      <div class="row" @click="openDoc('terms')">
        {{ $t('common.termsConditions') }}

        <CircleButton iconName="chevron-right" backgroundColor="none" />
      </div>
      <div class="row" @click="openDoc('privacy')">
        {{ $t('common.privacyPolicy') }}

        <CircleButton iconName="chevron-right" backgroundColor="none" />
      </div>
      <div class="row" @click="openDoc('unsupportedCountries')">
        {{ $t('soraCard.unsupportedCountries') }}

        <CircleButton iconName="chevron-right" backgroundColor="none" />
      </div>

      <Disclaimer />
    </div>

    <Button
      text="common.acceptContinue"
      width="100%"
      size="big"
      fontSize="big"
      :border="false"
      @click="$emit('openStepsKYCPopup')"
    />
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { URLS } from '@/consts/urls';
import Disclaimer from '@/screens/soraCard/stepsKYC/Disclaimer.vue';

@Component({
  components: { Disclaimer },
})
export default class TermsAndConditions extends Vue {
  link = '';

  @Getter(AccountsGettersTypes.fiatSymbol) fiatSymbol!: string;

  openDoc(value: 'terms' | 'privacy' | 'unsupportedCountries') {
    if (value === 'terms') this.link = URLS.SORA_CARD_TERMS;
    else if (value === 'privacy') this.link = URLS.SORA_CARD_PRIVACY;
    else this.$emit('toggleCountriesFormVisibility');
  }
}
</script>

<style scoped lang="scss">
.terms-conditions {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;

  .row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 0;
    margin: 0 16px;
    border-bottom: $default-border;
    color: $default-white;
    cursor: pointer;

    &:hover {
      color: $plain-white;
    }
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
