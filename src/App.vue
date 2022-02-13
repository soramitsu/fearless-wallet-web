<template>
  <div id="app">
    <s-card shadow="always" size="small" border-radius="mini">
      <template #header>Here will be a header</template>
      <div class="body-test">Here will be a content</div>
    </s-card>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';

@Component({})
export default class App extends Vue {}
</script>

<style lang="scss" scoped>
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: var(--s-color-base-content-primary);
  background-color: var(--s-color-utility-body);
  height: 100vh;
}
.body-test {
  height: 400px;
}
</style>
