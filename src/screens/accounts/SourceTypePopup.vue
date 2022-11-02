<template>
  <Popup
    headerText="common.sourceType"
    sizeWidth="big"
    :showBorder="true"
    :showAnimation="false"
    :handlerClose="handlerClose"
  >
    <div class="source-type-popup">
      <BorderButton
        borderRadius="mini"
        text="accounts.createNewAccount"
        class="button"
        @click="openAddWalletPage('create')"
      />

      <BorderButton
        borderRadius="mini"
        text="common.alreadyHaveAccount"
        class="button"
        @click="openAddWalletPage('import')"
      />

      <BorderButton borderRadius="mini" text="accounts.dontNeedAccount" class="button" @click="handlerClose" />
    </div>
  </Popup>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import Popup from '@/components/Popup.vue';
import BorderButton from '@/components/BorderButton.vue';
import { Components } from '@/router/routes';

@Component({
  components: {
    Popup,
    BorderButton,
  },
})
export default class ReplacePopup extends Vue {
  @Prop(Function) handlerClose!: VoidFunction;

  openAddWalletPage(type: string) {
    this.$router.push({
      name: Components.AddWallet,
      params: {
        type,
        onlyEthereumAccount: '',
      },
    });
  }
}
</script>

<style lang="scss" scoped>
.source-type-popup {
  padding: 0 16px;

  .button {
    margin-top: 10px;
  }
}
</style>
