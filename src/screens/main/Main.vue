<template>
  <div class="main">
    <div>
      <Header />

      <router-view></router-view>
    </div>

    <Menu />
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import Header from './Header.vue';
import Menu from './Menu.vue';

@Component({
  components: {
    Header,
    Menu,
  },
})
export default class extends Vue {}
</script>

<style lang="scss" scoped>
.main {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  width: 100%;
  height: 100%;
}
</style>
