<template>
  <div class="main">
    <Header />

    <router-view></router-view>

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
  width: 100%;
  height: 100%;
}
</style>
