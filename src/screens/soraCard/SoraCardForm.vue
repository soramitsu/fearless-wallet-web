<template>
  <AboveForm header="soraCard.title" :fullScreen="true" :closeHandler="closeHandler">
    <ContentForm :height="453">
      <div class="card-content">
        <Icon icon="sora-card" class="banner" />

        <div>11111</div>
        <div>341321</div>
      </div>
    </ContentForm>
  </AboveForm>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { Components } from '@/router/routes';

@Component
export default class SoraCardBanner extends Vue {
  @Getter(AccountsGettersTypes.getShowSoraCardBanner) getShowSoraCardBanner!: boolean;

  get statusText() {
    return 'Get SORA Card';
  }

  closeHandler() {
    if (window.history.length === 1) this.$router.push({ name: Components.Wallet });
    else this.$router.back();
  }
}
</script>

<style scoped lang="scss">
.card-content {
  padding: 16px;

  .banner {
    width: 497px;
    height: 298px;
  }
}
</style>
