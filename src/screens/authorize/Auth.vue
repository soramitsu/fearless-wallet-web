<template>
  <AboveForm header="Manage dApp access" :blur="true" :closeHandler="onChangeState">
    <SCol v-for="el in data" width="100%" v-bind:key="el.text">
      <SRow>
        <SCol :span="10" class="s-flex s-justify-start">
          <span class="auth-item-name">{{ el.name }}</span>
        </SCol>
        <SCol :span="2">
          <SRow flex justify="space-around">
            <Switcher v-model="el.state" />

            <img class="trash" src="@/assets/trash.svg" @click="onChangeState" />
          </SRow>
        </SCol>
      </SRow>
      <SDivider class="divider" />
    </SCol>
  </AboveForm>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import AuthItem from '@/screens/authorize/AuthItem.vue';
import Switcher from '@/components/Switcher.vue';
import AboveForm from '@/components/AboveForm.vue';
@Component({
  components: {
    AuthItem,
    AboveForm,
    Switcher,
  },
})
export default class Auth extends Vue {
  data = [
    {
      name: 'polkadot/apps',
      state: true,
    },
    {
      name: 'polkaswap',
      state: false,
    },
  ];

  onChangeState(event: Event) {
    console.log(event);
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
