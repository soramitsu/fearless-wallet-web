<script setup lang="ts">
import { detectDeviceType } from "../helpers/common";

const title = "TON Connect";
const description = "TON Connect desctiption";
const keywords = "TON Connect, TON";
let deviceType = "desktop";

useSeoMeta({
  title,
  ogTitle: title,
  twitterTitle: title,
  description,
  ogDescription: description,
  twitterDescription: description,
})

useHead({ meta: [{ name: 'keywords', content: keywords }] });

const steps = [
  {
    number: 1,
    subtitle: "Don’t have Fearless Wallet yet?",
    icon: "/icons/one.png",
    textBtn: "Install Fearless Wallet",
    classes: "img-one",
  },
  {
    number: 2,
    title: "After installation: ",
    subtitle: "Open the app and approve the dApp connection.",
    icon: "/icons/two.png",
    //textBtn: "Open Fearless Wallet",
  },
  {
    number: 3,
    title: "Once connected: ",
    subtitle: "Return to the dApp to continue.",
    icon: "/icons/three.png",
    //textBtn: "Return to dApp",
  },
];

onMounted(() => {
  console.log(1);

  deviceType = detectDeviceType();
});

const handleCLick = (step: number) => {
  if (step === 1) {
    if (deviceType === "desktop") window.open("https://qrcodes.pro/5FVEPa");
    else window.open("https://qrcodes.pro/RC9fNu");

    return;
  }

  if (step === 2) {
    if (deviceType === "desktop")
      window.open(
        "chrome-extension://nhlnehondigmgckngjomcpcefcdplmgc/popup.html#/welcome"
      );
    else window.open("");

    return;
  }

  if (step === 3) {
  }
};
</script>

<template>
  <h3 class="px-l pt-3xl text-center">Connect Fearless Wallet</h3>

  <div class="steps-container">
    <div
      v-for="step in steps"
      :key="step.title"
      class="bg-block rounded-s rich step"
    >
      <div class="step-content">
        <div class="step-icon">
          <img :src="step.icon" :class="step.classes ?? 'img'" />
        </div>

        <div class="step-description py-s pr-xs">
          <div v-if="step.title" class="text-s mt-xs step-title">{{ step.title }}</div>
          <div v-if="step.subtitle" class="text-xs mb-s">{{ step.subtitle }}</div>

          <Button v-if="step.textBtn"
            xsSmall
            accent
            :title="step.textBtn"
            class="step-btn"
            @click="handleCLick(step.number)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.steps-container {
  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column;
  gap: 20px;
  margin-top: 50px;
}

.step-icon {
  display: flex;
  justify-content: center;
  align-items: center;
  min-width: 95px;
  max-width: 95px;
  height: 150px;
}

.step {
  width: 343px;
}

.step-content {
  display: flex;
}

.img-one {
  height: 150px;
  width: 44px;
}

.img {
  height: 150px;
  width: 70px;
}

.step-description {
  display: flex;
  flex-direction: column;
  justify-content: space-evenly;
  min-height: 150px;
}

.step-btn {
  width: 200px;
}

.step-title {
  color: var(--color-link);
}
</style>
