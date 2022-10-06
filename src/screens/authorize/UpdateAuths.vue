<template>
  <AboveForm :blur="true" :closeHandler="back" :header="header">
    <div class="update-accounts">
      <div class="update-accounts__content">
        <SelectAuthAccount :accounts="accs" />
      </div>
      <Button width="100%" :text="prepName" size="big" fontSize="big" @click="updateAuths" />
    </div>
  </AboveForm>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import SelectAuthAccount from '@/screens/authorize/SelectAuthAccount.vue';
import AboveForm from '@/components/AboveForm.vue';
import Button from '@/components/Button.vue';

@Component({
  components: {
    SelectAuthAccount,
    AboveForm,
    Button,
  },
})
export default class Authorize extends Vue {
  accs: Record<string, string>[] = [];

  back() {
    this.$router.back();
  }

  get header() {
    return `Accounts connected to ${'polkadot.js.org'}`;
  }

  get prepName() {
    return 'Connect 1 accounts(s)';
  }

  updateAuths() {
    console.log('update!');
  }

  mounted() {
    this.accs.push({
      name: 'test1',
      address: '22342fdsfsdfsdfsdfddffdfdfdfdfdfdfd',
    });
    this.accs.push({
      name: 'test2',
      address: '22342fdsfsdfsdfsdfddffdfdfdfdfdfdfd',
    });
    this.accs.push({
      name: 'test4',
      address: '22342fdsfsdfsdfsdfddffdfdfdfdfdfdfd',
    });
    this.accs.push({
      name: 'test3',
      address: '22342fdsfsdfsdfsdfddffdfdfdfdfdfdfd',
    });
    this.accs.push({
      name: 'test5',
      address: '22342fdsfsdfsdfsdfddffdfdfdfdfdfdfd',
    });
  }
}
</script>

<style lang="scss" scoped>
.update-accounts {
  display: flex;
  flex-flow: column;
  justify-content: space-between;
  height: 100%;
}

.update-accounts__content {
  height: 300px;
  overflow-y: scroll;
}
</style>
