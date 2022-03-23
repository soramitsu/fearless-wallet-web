<template>
  <div class="create-wallet">
    <NicknameForm v-if="currentIndexPage === 0" />
    <template v-else>
      <MnemonicFom
        v-if="currentIndexPage === 1 || currentIndexPage === 2"
        :mnemonic="mnemonic"
        :selectedMnemonicElements="selectedMnemonicElements"
        :unselectedMnemonicElements="unselectedMnemonicElements"
        :currentIndexPage="currentIndexPage"
        @updateSelectedMnemonicElements="updateSelectedMnemonicElements"
      />
      <Advanced
        v-if="currentIndexPage === 1"
        :substrateSecretDerivationPath="substrateSecretDerivationPath"
        :ethereumSecretDerivationPath="ethereumSecretDerivationPath"
        @updatedDerivationPath="updatedDerivationPath"
      />
    </template>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import NicknameForm from '../NicknameForm.vue';
import MnemonicFom from './MnemonicFom.vue';
import MainPage from '../../mainPage/MainPage.vue';
import Advanced from '../Advanced.vue';

@Component({
  components: {
    NicknameForm,
    MnemonicFom,
    MainPage,
    Advanced,
  },
})
export default class extends Vue {
  @Prop(Number) currentIndexPage!: number;
  @Prop(String) mnemonic!: string;
  @Prop(Array) selectedMnemonicElements!: string[];
  @Prop(Array) unselectedMnemonicElements!: string[];
  @Prop(String) substrateSecretDerivationPath!: string;
  @Prop(String) ethereumSecretDerivationPath!: string;

  updateSelectedMnemonicElements(element: string, index: number, added: boolean) {
    this.$emit('updateSelectedMnemonicElements', element, index, added);
  }

  updatedDerivationPath(value: string, name: string) {
    this.$emit('updatedDerivationPath', value, name);
  }
}
</script>

<style lang="scss" scoped>
.create-wallet {
  background-color: black;
  color: white;
  display: flex;
  flex-direction: column;
  height: 450px;

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
