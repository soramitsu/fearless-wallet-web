<template>
  <figure class="visual" width="375" height="812">
    <NuxtImg preload src="/hero/back.svg" alt="Fearless Wallet mobile app screen" class="back" />
    <NuxtImg preload src="/hero/screen.svg" alt="Fearless Wallet mobile app screen" class="screen" />

    <div class="second" style="top: 28%; background-image: url('/hero/second1.svg'); aspect-ratio: 343/32" />
    <div class="second" style="top: 34%; background-image: url('/hero/second2.svg')" />
    <div class="second" style="top: 45%; background-image: url('/hero/second3.svg')" />
    <div class="second" style="top: 67%; background-image: url('/hero/second4.svg')" />
    <div class="second" style="top: 78%; background-image: url('/hero/second5.svg')" />

    <div class="third" style="left: -24%; background-image: url('/hero/third1.svg'); aspect-ratio: 21/10" />
    <div class="third" style="left: 23%; background-image: url('/hero/third2.svg')" />
  </figure>
</template>

<style scoped>
.visual {
  position: relative;
  box-shadow: 2rem 2rem 13rem rgba(0, 0, 0, 0.75);
  border-radius: 3rem;
  transform-style: preserve-3d;
  aspect-ratio: 375/812;
  animation: rotate 2s ease-in-out infinite alternate;
}

.back,
.screen {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.screen {
  transform: translateZ(3vw);
}

.visual svg {
  display: block;
}

.second {
  position: absolute;
  left: 4.267%;
  width: 91.467%;
  transform: translateZ(16vw);
}

.third {
  position: absolute;
  height: 9.852%;
  top: 56%;
  transform: translateZ(24vw);
}

.second,
.third {
  backdrop-filter: blur(1rem);
  background-size: contain;
  background-repeat: no-repeat;
  aspect-ratio: 343/80;
}

@keyframes rotate {
  from {
    transform: rotateX(26deg) rotateY(-16deg) rotateZ(20deg);
  }

  to {
    transform: rotateX(26deg) rotateY(-5deg) rotateZ(10deg);
  }
}

@media (min-width: 800px) {
  .screen {
    transform: translateZ(2rem);
  }

  .second {
    transform: translateZ(10rem);
  }

  .third {
    transform: translateZ(15rem);
  }
}
</style>