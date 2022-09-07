<template>
  <div class="container">
    <div class="header">
      <img class="header__logo" src="@/assets/wallet-logo.svg" />
      <span>Transaction</span>
    </div>
    <div class="content">
      <slot name="content"></slot>
    </div>
    <div>
      <slot name="control"></slot>
    </div>
  </div>
</template>

<script lang="ts">
export default {};
</script>

<style lang="scss" scoped>
.container {
  display: grid;
  grid-template-rows: 50px minmax(300px, 400px) 100px;
  align-items: end;
  gap: 20px;
  height: 100%;
}
.header {
  display: flex;
  flex-flow: row;
  align-items: center;
  font-size: 24px;
  height: 100%;
}
.content {
  max-height: 400px;
}
.header > .header__logo {
  padding-right: 20px;
}
</style>
