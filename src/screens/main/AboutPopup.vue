<template>
  <div>
    <Popup
      :showBorder="true"
      :staticHeight="true"
      :showAnimation="false"
      :showHeader="false"
      :top="50"
      :handlerClose="handlerClose"
      sizeWidth="big"
      verticalPlacement="top"
      horizontalPlacement="right"
    >
      <div class="about-popup">
        <div class="header">About</div>
        <div class="title">Fearless wallet</div>

        <div v-for="{ icon, label, subLabel, url } in mainItems" class="about-item" :key="label" @click="open(url)">
          <div class="about-left-part">
            <img :src="getImg(icon)" class="icon" />

            <div class="item-descriptions">
              <div class="label">{{ label }}</div>
              <div v-if="subLabel" class="sub-label">{{ subLabel }}</div>
            </div>
          </div>

          <img src="@/assets/chevron-right.svg" :href="url" class="chevron-right" />
        </div>

        <div class="title">Community wallet</div>

        <div
          v-for="{ icon, label, subLabel, url } in communityItems"
          class="about-item"
          :key="label"
          @click="open(url)"
        >
          <div class="about-left-part">
            <img :src="getImg(icon)" class="icon" />

            <div class="item-descriptions">
              <div class="label">{{ label }}</div>
              <div v-if="subLabel" class="sub-label">{{ subLabel }}</div>
            </div>
          </div>

          <img src="@/assets/chevron-right.svg" class="chevron-right" />
        </div>

        <div class="title">Social Media</div>

        <div
          v-for="{ icon, label, subLabel, url } in socialMediaItems"
          class="about-item"
          :key="label"
          @click="open(url)"
        >
          <div class="about-left-part">
            <img :src="getImg(icon)" class="icon" />

            <div class="item-descriptions">
              <div class="label">{{ label }}</div>
              <div v-if="subLabel" class="sub-label">{{ subLabel }}</div>
            </div>
          </div>

          <img src="@/assets/chevron-right.svg" class="chevron-right" />
        </div>

        <div class="title">Support & Feedback</div>

        <div v-for="{ icon, label, subLabel, url } in supportItems" class="about-item" :key="label" @click="open(url)">
          <div class="about-left-part">
            <img :src="getImg(icon)" class="icon" />

            <div class="item-descriptions">
              <div class="label">{{ label }}</div>
              <div v-if="subLabel" class="sub-label">{{ subLabel }}</div>
            </div>
          </div>

          <img src="@/assets/chevron-right.svg" class="chevron-right" />
        </div>
      </div>
    </Popup>
  </div>
</template>

<script lang="ts">
import Popup from '@/components/Popup.vue';
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component({
  components: { Popup },
})
export default class Main extends Vue {
  mainItems = [
    {
      icon: 'info.svg',
      label: 'Official Website',
      subLabel: 'fearlesswallet.io',
      url: 'https://fearlesswallet.io/',
    },
    {
      icon: 'wiki.svg',
      label: 'Learn on Wiki',
      subLabel: 'wiki.fearlesswallet.io',
      url: 'https://wiki.sora.org/master',
    },
    {
      icon: 'github.svg',
      label: 'Github Source Code',
      subLabel: 'App version 1.1.0',
      url: 'https://github.com/soramitsu/fearless-wallet-web',
    },
    {
      icon: 'terms_conditions.svg',
      label: 'Terms and Conditions',
      url: '',
    },
    {
      icon: 'terms_conditions.svg',
      label: ' Privacy Policy',
      url: '',
    },
  ];

  communityItems = [
    {
      icon: 'telegram.svg',
      label: 'Join on Telegram',
      subLabel: 't.me/fearlesswallet',
      url: 'https://t.me/fearlesswallet',
    },
    {
      icon: 'medium.svg',
      label: 'Read on Medium',
      subLabel: 'medium.com/fearlesswallet',
      url: 'https://medium.com/fearlesswallet',
    },
  ];

  socialMediaItems = [
    {
      icon: 'instagram.svg',
      label: 'Like on Instagram',
      subLabel: 'instagram.com/fearless_wallet',
      url: 'https://www.instagram.com/fearless_wallet',
    },
    {
      icon: 'twitter.svg',
      label: 'Read on Twitter',
      subLabel: 'twitter.com/Soramitsu_co',
      url: 'https://twitter.com/Soramitsu_co',
    },
    {
      icon: 'youtube.svg',
      label: 'Subscribe on YouTube',
      subLabel: 'youtube.com/fearlesswallet',
      url: 'https://www.youtube.com/fearlesswallet',
    },
    {
      icon: 'announcements.svg',
      label: 'Receive Announcements',
      subLabel: 't.me/fearless_announcements',
      url: 'https://t.me/fearless_announcements',
    },
  ];

  supportItems = [
    {
      icon: 'support.svg',
      label: 'Ask for Support',
      subLabel: 't.me/fearlesshappiness',
      url: 'https://t.me/fearlesshappiness',
    },
    {
      icon: 'more.svg',
      label: 'Contact Email',
      subLabel: 'fearless@soramitsu.co.jp',
      url: 'fearless@soramitsu.co.jp',
    },
  ];

  @Prop(Function) handlerClose!: VoidFunction;

  getImg(path: string) {
    return require(`@/assets/${path}`);
  }

  open(url: string) {
    window.open(url);

    this.handlerClose();
  }
}
</script>

<style lang="scss" scoped>
.about-popup {
  display: flex;
  flex-direction: column;
  text-align: left;
  padding: 0 16px;

  .header {
    font-weight: 700;
    color: rgba(255, 255, 255, 0.75);
  }

  .title {
    font-weight: 700;
    color: rgba(255, 255, 255, 0.5);
    padding: 12px 0;
  }

  .about-item {
    display: flex;
    justify-content: space-between;
    padding-bottom: 12px;

    &:last-child {
      padding-bottom: 0px;
    }

    &:hover {
      cursor: pointer;

      .chevron-right {
        opacity: 0.7;
      }

      .icon {
        opacity: 0.9;
      }

      .item-descriptions {
        .label {
          color: rgba(255, 255, 255, 0.85);
        }

        .sub-label {
          color: rgba(255, 255, 255, 0.75);
        }
      }
    }

    .about-left-part {
      display: flex;
    }

    .item-descriptions {
      display: flex;
      flex-direction: column;
      justify-content: center;
      margin-left: 12px;
      width: 185px;

      .label {
        font-weight: 700;
        font-size: 14px;
        color: rgba(255, 255, 255, 0.75);
      }

      .sub-label {
        margin-top: 2px;
        font-size: 12px;
        color: rgba(255, 255, 255, 0.65);
      }
    }

    .chevron-right {
      opacity: 0.5;
    }

    .icon {
      opacity: 0.75;
      height: 24px;
      width: 24px;
      margin: auto;
    }
  }
}
</style>
