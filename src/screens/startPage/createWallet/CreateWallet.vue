<template>
  <div class="create-wallet">
    <NicknameForm v-if="currentIndexPage === 0" />
    <MnemonicFom
      v-else-if="currentIndexPage === 1 || currentIndexPage === 2"
      :mnemonic="mnemonic"
      :selectedMnemonicElements="selectedMnemonicElements"
      :unselectedMnemonicElements="unselectedMnemonicElements"
      :currentIndexPage="currentIndexPage"
      @updateSelectedMnemonicElements="updateSelectedMnemonicElements"
    />
    <MainPage v-if="currentIndexPage === 3" />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import NicknameForm from './NicknameForm.vue';
import MnemonicFom from './MnemonicFom.vue';
import MainPage from '../../mainPage/MainPage.vue';

@Component({
  components: {
    NicknameForm,
    MnemonicFom,
    MainPage,
  },
})
export default class App extends Vue {
  @Prop(Number) currentIndexPage!: number;
  @Prop(Array) mnemonic!: string[];
  @Prop(Array) selectedMnemonicElements!: string[];
  @Prop(Array) unselectedMnemonicElements!: string[];

  updateSelectedMnemonicElements(element: string, index: number, added: boolean) {
    this.$emit('updateSelectedMnemonicElements', element, index, added);
  }
}
</script>

<style lang="scss" scoped>
.create-wallet {
  background-color: black;
  color: white;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 435px;

  i {
    color: white;
  }

  .header {
    display: flex;
    height: 65px;
    line-height: 65px;
    justify-content: center;
  }
}
</style>
