<template>
  <Popup :showBorder="true" :showAnimation="false" :handlerClose="handlerClose">
    <div class="replace-popup">
      <div class="header">Replace {{ network }} account</div>

      <div class="activity">
        <div class="button" @click="openAddWalletComponent('create')">
          <Icon icon="create" className="img" />

          <div>{{ $t('accounts.createAccount') }}</div>
        </div>
        <div class="button" @click="openAddWalletComponent('import')">
          <Icon icon="import" className="img" />

          <div>{{ $t('accounts.importAccount') }}</div>
        </div>
      </div>
    </div>
  </Popup>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import Popup from '@/components/Popup.vue';
import { Components } from '@/router/routes';

@Component({
  components: { Popup },
})
export default class ReplacePopup extends Vue {
  @Prop(String) selectedNetwork!: string;
  @Prop(Function) handlerClose!: VoidFunction;

  get network() {
    return this.selectedNetwork.toUpperCase();
  }

  openAddWalletComponent(type: string) {
    this.$router.push({
      name: Components.AddWallet,
      params: {
        type,
        network: this.selectedNetwork,
      },
    });
  }
}
</script>

<style lang="scss" scoped>
.replace-popup {
  .header {
    font-weight: 700;
    font-size: 18px;
    line-height: 150%;
    width: 205px;
    margin: 0 auto 15px auto;
  }

  .activity {
    display: flex;
    justify-content: center;

    .img {
      width: 22px;
      height: 22px;
      opacity: 0.5;
    }

    .button {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      align-items: center;
      width: 110px;
      height: 135px;
      border: 1px solid $secondary-background-color;
      color: $default-white;
      border-radius: 8px;
      font-weight: 500;
      font-size: 14px;
      margin-right: 10px;
      padding: 20px 0;

      &:last-child {
        margin-right: 0;
      }

      &:hover {
        .img {
          opacity: 1;
        }

        cursor: pointer;
        color: rgba(255, 255, 255, 1);
      }
    }
  }
}
</style>
