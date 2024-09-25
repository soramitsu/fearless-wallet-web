<template>
  <div class="finish">
    <Logo
      class="description"
      size="big"
      text="addWallet.allDone"
      subtext="addWallet.stayFearless"
      data-testid="finishLogo"
    />

    <div class="row">
      <BorderButton
        text="common.followTwitter"
        iconName="twitter"
        iconColor="pink"
        class="follow-button"
        width="256px"
        data-testid="twitterBtn"
        @click="openPage(URLS.TWITTER)"
      />

      <BorderButton
        text="common.joinTelegram"
        iconName="telegram"
        iconColor="pink"
        width="256px"
        data-testid="telegramBtn"
        @click="openPage(URLS.TELEGRAM)"
      />
    </div>
    <div class="row">
      <BorderButton
        text="common.readMedium"
        iconName="medium"
        iconColor="pink"
        width="256px"
        data-testid="mediumBtn"
        @click="openPage(URLS.MEDIUM)"
      />

      <BorderButton
        text="common.learnWiki"
        iconName="file-dock"
        width="256px"
        data-testid="wikiBtn"
        @click="openPage(URLS.WIKI)"
      />
    </div>
  </div>
</template>

<script lang="ts" setup>
import { URLS } from '@/consts/urls';

const openPage = (url: string) => window.open(url);
</script>

<style lang="scss" scoped>
.finish {
  .row {
    display: flex;
    justify-content: space-between;
    margin-top: 15px;
    gap: 10px;
  }

  .description {
    margin: 37px 0 60px;
  }
}

.fw-web {
  .row {
    flex-direction: column;
    align-items: center;
    margin-top: 10px;
  }
  .description {
    margin: 27px 0 30px;
  }
}
</style>
