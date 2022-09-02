<template>
  <SCol width="100%" v-bind:key="request.id">
    <SRow>
      <SCol :span="10" class="s-flex s-justify-start">
        <span class="auth-item-name">{{ request.origin }}</span>
      </SCol>
      <SCol :span="2">
        <SRow flex justify="space-around">
          <!-- <Switcher v-model="value" /> -->

          <img class="trash" src="@/assets/trash.svg" @click="$emit('onRemoveAuth', request.id)" />
        </SRow>
      </SCol>
    </SRow>
    <SDivider class="divider" />
  </SCol>
</template>

<script lang="ts">
import { Vue, Component, Prop } from 'vue-property-decorator';
import { AuthUrlInfo } from '@polkadot/extension-base/background/handlers/State';
import Switcher from '@/components/Switcher.vue';
import store from '@/store';

@Component({
  components: {
    Switcher,
  },
})
export default class AuthItem extends Vue {
  @Prop(Object) request!: AuthUrlInfo;

  get value() {
    return this.request.isAllowed === undefined ? true : this.request.isAllowed;
  }

  set value(value: boolean) {
    store.commit('TOGGLE_AUTH_STATE', {
      id: this.request.id,
      value,
    });
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
