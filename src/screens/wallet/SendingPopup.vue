<template>
  <Popup :header="header" :handlerClose="handlerClose" class="sending-popup">
    <div class="popup-content">
      <Loading v-if="popupLoading" />

      <template v-else>
        <div class="descriptions">
          <img :src="getImg(firstNetwork)" class="network-img" />

          <template v-if="secondNetwork">
            <s-icon name="arrows-arrow-right-24" />

            <img :src="getImg(secondNetwork)" class="network-img" />
          </template>
        </div>
        <div class="transfer-amount">{{ transferAmountString }}</div>
        <div class="transfer-value">{{ transferValueString }}</div>
      </template>
    </div>
  </Popup>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import Loading from '@/components/Loading.vue';
import Popup from '@/components/Popup.vue';
import { getImgPathByNetworkName } from '@/util/imgPath';

@Component({
  components: {
    Popup,
    Loading,
  },
})
export default class SendingPopup extends Vue {
  @Prop(Boolean) popupLoading!: boolean;
  @Prop(String) header!: string;
  @Prop(String) amount!: string;
  @Prop(String) value!: string;
  @Prop(String) token!: string;
  @Prop(String) firstNetwork!: string;
  @Prop(String) secondNetwork!: string;
  @Prop(Function) handlerClose!: VoidFunction;

  get transferAmountString() {
    return `-${this.amount} ${this.token}`;
  }

  get transferValueString() {
    return `$${this.value}`;
  }

  getImg(network: string) {
    return require(`@/assets/networks/${getImgPathByNetworkName(network)}`);
  }
}
</script>

<style lang="scss" scoped>
.sending-popup {
  z-index: 399;

  .popup-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 140px;

    .descriptions {
      display: flex;
      justify-content: space-between;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 50px;
      margin-bottom: 20px;
      padding: 12px;

      .network-img {
        width: 30px;
      }

      .s-icon-arrows-arrow-right-24 {
        color: rgba(255, 255, 255, 0.3);
        font-size: 30px !important;
        margin: 0 10px;
      }
    }

    .transfer-amount {
      font-weight: 800;
      font-size: 20px;
      margin-bottom: 10px;
    }

    .transfer-value {
      font-size: 16px;
      color: rgba(255, 255, 255, 0.5);
    }
  }
}
</style>
