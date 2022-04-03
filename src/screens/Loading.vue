<template functional>
  <div class="loading">
    <div class="circle">
      <img src="../assets/fw-pink-logo.svg" class="logo" />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.loading {
  position: absolute;

  .circle {
    border-radius: 50%;
    width: 96px;
    height: 96px;
    border: 8px solid rgba(255, 255, 255, 0.1);
    display: flex;
    align-items: center;
  }

  .circle:after {
    content: ' ';
    top: 0;
    left: 0;
    position: absolute;
    display: block;
    width: 96px;
    height: 96px;
    border-radius: 50%;
    border: 8px solid #ee0077;
    border-color: #ee0077 transparent transparent;
    animation: arc 2s linear infinite;
  }

  .logo {
    height: 39px;
    width: 70px;
    margin: 0 auto;
  }

  @keyframes arc {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }
}
</style>
