<template>
  <SCol width="100%" v-bind:key="requestsData.id">
    <SRow>
      <SCol :span="10" class="s-flex s-justify-start">
        <span class="auth-item-name">{{ requestsData.origin }}</span>
      </SCol>
      <SCol :span="2">
        <SRow flex justify="space-around">
          <Switcher :value="requestsData.isAllowed" />

          <img class="trash" src="@/assets/trash.svg" @click="removeConnection()" />
        </SRow>
      </SCol>
    </SRow>
    <SDivider class="divider" />
  </SCol>
</template>

<script lang="ts">
import { Vue, Component, PropSync } from 'vue-property-decorator';
import Switcher from '@/components/Switcher.vue';
import { AuthUrlInfo } from '@polkadot/extension-base/background/handlers/State';
import store from '@/store';
@Component({
  components: {
    Switcher,
  },
})
export default class AuthsList extends Vue {
  @PropSync('requests', { type: Object }) requestsData!: AuthUrlInfo;
  mounted() {
    console.log(this.requestsData, 'auth item');
  }

  removeConnection() {
    const { id } = this.requestsData;
    store.dispatch('DELETE_AUTH_CONNECTION', id);
  }
}
</script>

<style lang="scss" scoped>
.divider {
  background-color: rgba(255, 255, 255, 0.1);
  margin: 17px 0;
}
.auth-item-name {
  font-size: 16px;
}
.img-button {
  background-image: url('@/assets/trash.svg');
  background-size: 16px 16px;
  height: 16px;
  width: 16px;
}
.trash {
  cursor: pointer;
}
</style>
