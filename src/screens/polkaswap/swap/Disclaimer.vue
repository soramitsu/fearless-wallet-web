<template>
  <AboveForm header="common.disclaimer" :fullScreen="true" @closeHandler="closeForm">
    <div class="disclaimer">
      <Scroll>
        <div>
          {{ $t('disclaimers.swapDisclaimer1') }}

          <span class="highlight" @click="open(urls.POLKASWAP_FAQ)">{{ $t('disclaimers.polkaswapFAQ') }}</span>

          {{ $t('disclaimers.swapDisclaimer2') }}

          <span class="highlight" @click="open(urls.POLKASWAP_MEMORANDUM)">
            {{ $t('disclaimers.polkaswapMemorandum') }},
          </span>

          <span> {{ $t('common.and') }} </span>

          <span class="highlight" @click="open(urls.POLKASWAP_POLICY)">{{ $t('common.privacyPolicy') }}.</span>
        </div>

        <div class="row">
          {{ $t('disclaimers.swapDisclaimer3') }}
        </div>

        <div class="row">
          {{ $t('disclaimers.swapDisclaimer4') }}
        </div>

        <div class="row">1. {{ $t('disclaimers.swapDisclaimer5') }}</div>

        <div class="row">2. {{ $t('disclaimers.swapDisclaimer6') }}</div>

        <div class="row">3. {{ $t('disclaimers.swapDisclaimer7') }}</div>

        <div class="row all-rules">
          {{ $t('disclaimers.swapDisclaimer8') }}
          <span class="highlight" @click="open(urls.POLKASWAP_FAQ)">{{ $t('disclaimers.polkaswapFAQ') }}, </span>

          <span class="highlight" @click="open(urls.POLKASWAP_MEMORANDUM)">
            {{ $t('disclaimers.polkaswapMemorandum') }},
          </span>

          <span> {{ $t('common.and') }} </span>

          <span class="highlight" @click="open(urls.POLKASWAP_POLICY)">{{ $t('common.privacyPolicy') }}!</span>
        </div>

        <div v-if="showSwitcher" class="important-wrapper">
          <div>
            <span class="important">{{ $t('disclaimers.important') }} </span>
            <span>{{ $t('disclaimers.importantText') }}</span>
          </div>

          <Switcher v-model="agreeWithRules" />
        </div>
      </Scroll>

      <FButton v-if="showSwitcher" size="big" text="common.continue" :disabled="buttonDisabled" @click="agree" />
    </div>
  </AboveForm>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Mutation } from 'vuex-class';
import type { Fn } from '@/interfaces';
import { MutationTypes as AccountsMutationTypes } from '@/store/accounts/mutations';
import { URLS } from '@/consts/urls';

@Component
export default class Disclaimer extends Vue {
  agreeWithRules = false;

  @Mutation(AccountsMutationTypes.HIDE_POLKASWAP_ALERT) hidePolkaswapAlert!: Fn<unknown>;

  get showSwitcher() {
    return this.$route.params.showSwitcher;
  }

  get buttonDisabled() {
    return !this.agreeWithRules;
  }

  get urls() {
    return URLS;
  }

  open(url: string) {
    window.open(url);
  }

  closeForm() {
    this.$router.back();
  }

  agree() {
    this.hidePolkaswapAlert();
    this.closeForm();
  }
}
</script>

<style lang="scss" scoped>
.disclaimer {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  text-align: left;
  color: $gray-color;
  height: 100%;

  .highlight {
    color: $pink-color;
    cursor: pointer;
  }

  .row {
    margin-top: 16px;
  }

  .all-rules {
    border-left: 1px solid $pink-color;
    padding-left: 16px;
    width: 525px;
    margin-bottom: 16px;
  }

  .important-wrapper {
    display: flex;
    margin-bottom: 16px;

    .important {
      color: $simple-orange-color;
      font-weight: 600;
    }
  }
}
</style>
