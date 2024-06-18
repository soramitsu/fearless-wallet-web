<template>
  <Alert v-if="showPolkaswapAlert" message="common.readPolkaswapDisclaimer" headerMessage="common.disclaimer">
    <div class="alert-content" data-testid="alertContent">
      {{ $t('common.readPolkaswapDisclaimer') }}

      <FButton
        width="85px"
        size="mini"
        fontSize="small"
        type="warning"
        text="common.read"
        data-testid="readBtn"
        :border="false"
        @click="openPolkaswapDisclaimer"
      />
    </div>
  </Alert>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { Components } from '@/router/routes';

@Component
export default class PolkaswapAlert extends Vue {
  @Getter(AccountsGettersTypes.showPolkaswapAlert) showPolkaswapAlert!: boolean;

  openPolkaswapDisclaimer() {
    this.$router.push({
      name: Components.PolkaswapDisclaimer,
      params: { showSwitcher: '1' },
    });
  }
}
</script>

<style lang="scss" scoped>
.alert-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
