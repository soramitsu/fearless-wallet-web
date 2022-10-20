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
import { Component, Vue, Prop } from 'vue-property-decorator';
import Popup from '@/components/Popup.vue';
import { MAIN_ITEMS, COMMUNITY_ITEMS, SOCIAL_MEDIA_ITEMS, SUPPORT_ITEMS } from '@/consts/extensionInformation';

@Component({
  components: { Popup },
})
export default class AboutPopup extends Vue {
  mainItems = MAIN_ITEMS;
  communityItems = COMMUNITY_ITEMS;
  socialMediaItems = SOCIAL_MEDIA_ITEMS;
  supportItems = SUPPORT_ITEMS;

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
  padding: 0 $default-padding;

  .header {
    font-weight: 700;
    color: $default-white;
  }

  .title {
    font-weight: 700;
    color: $gray-color;
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
          color: $default-white;
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
        color: $default-white;
      }

      .sub-label {
        margin-top: 2px;
        font-size: 12px;
        color: $grayish-white;
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
