<template>
  <div>
    <DisclaimerForm v-if="step === 2" @toggleCountriesFormVisibility="$emit('toggleCountriesFormVisibility')" />

    <PhoneConfirmation v-if="step === 3" @toggleIsValidSmsCode="$emit('toggleIsValidSmsCode', $event)" />

    <EmailConfirmation v-if="step === 4" @toggleIsValidEmailForm="$emit('toggleIsValidEmailForm', $event)" />

    <div class="disclaimer">
      <span class="disclaimer-label">{{ $t('common.disclaimer') }}: </span>

      {{ $t('soraCard.disclaimerSoraCard') }}
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import DisclaimerForm from '@/screens/soraCard/DisclaimerForm.vue';
import PhoneConfirmation from '@/screens/soraCard/PhoneConfirmation.vue';
import EmailConfirmation from '@/screens/soraCard/EmailConfirmation.vue';

@Component({
  components: {
    DisclaimerForm,
    PhoneConfirmation,
    EmailConfirmation,
  },
})
export default class KYC extends Vue {
  @Prop(Number) step!: number;
}
</script>

<style scoped lang="scss">
.disclaimer {
  margin-top: 16px;
  text-align: left;
  font-size: 14px;
  padding: 0 16px;
  color: $gray-color;

  .disclaimer-label {
    color: $simple-orange-color;
  }
}
</style>
