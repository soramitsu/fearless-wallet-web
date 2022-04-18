<template>
  <div class="main-page">
    <div>All addresses:</div>
    <div v-for="{ address, name } in addressesInfo" :key="address" class="row">
      <Identicon :size="42" theme="polkadot" :value="address" />
      <div class="descriptions-wallet">
        <div class="nickname">{{ name }}</div>
        <div class="address">{{ address }}</div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import Identicon from '@polkadot/vue-identicon';
import keyring from '@polkadot/ui-keyring';

@Component({
  components: { Identicon },
})
export default class extends Vue {
  get accounts() {
    return keyring.getAccounts();
  }

  get addressesInfo() {
    return this.accounts.map(({ address }) => {
      const {
        meta: { name },
      } = keyring.getPair(address);

      return {
        address,
        name: name ?? 'default name',
      };
    });
  }
}
</script>

<style lang="scss" scoped>
.main-page {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: scroll;
  &::-webkit-scrollbar {
    width: 0;
  }

  .nickname {
    text-align: left;
  }

  .row {
    margin: 5px 0;
    display: flex;
    padding: 10px 15px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background-color: rgba(255, 255, 255, 0.05);
    clip-path: polygon(20px 0, 100% 0, 100% calc(100% - 20px), calc(100% - 20px) 100%, 0 100%, 0 20px);

    .descriptions-wallet {
      margin: auto 0 auto 10px;

      .nickname {
        margin-bottom: 7px;
        font-size: 15px;
      }

      .address {
        color: #bb77ff;
        font-size: 13.5px;
      }
    }
  }
}
</style>
