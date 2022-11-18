<template>
  <div>
    <Popup
      :showBorder="true"
      :showAnimation="false"
      :showHeader="false"
      :width="410"
      :top="50"
      :handlerClose="handlerClose"
      sizeWidth="big"
      verticalPlacement="top"
      horizontalPlacement="right"
    >
      <div class="about-popup">
        <div class="header">{{ t('text') }}</div>
        <div class="title">Fearless Wallet</div>

        <div v-for="{ icon, label, subLabel, url } in mainItems" class="about-item" :key="label" @click="open(url)">
          <div class="about-left-part">
            <Icon :icon="icon" class="icon" />

            <div class="item-descriptions">
              <div class="label">{{ t(label) }}</div>

              <div v-if="subLabel" class="sub-label">{{ subLabel }}</div>
            </div>
          </div>

          <Icon icon="chevron-right" :href="url" className="chevron-right" />
        </div>

        <div class="title">{{ t('communityWallet') }}</div>

        <div
          v-for="{ icon, label, subLabel, url } in communityItems"
          class="about-item"
          :key="label"
          @click="open(url)"
        >
          <div class="about-left-part">
            <Icon :icon="icon" class="icon" />

            <div class="item-descriptions">
              <div class="label">{{ t(label) }}</div>

              <div v-if="subLabel" class="sub-label">{{ subLabel }}</div>
            </div>
          </div>

          <Icon icon="chevron-right" className="chevron-right" />
        </div>

        <div class="title">{{ t('socialMedia') }}</div>

        <div
          v-for="{ icon, label, subLabel, url } in socialMediaItems"
          class="about-item"
          :key="label"
          @click="open(url)"
        >
          <div class="about-left-part">
            <Icon :icon="icon" class="icon" />

            <div class="item-descriptions">
              <div class="label">{{ t(label) }}</div>

              <div v-if="subLabel" class="sub-label">{{ subLabel }}</div>
            </div>
          </div>

          <Icon icon="chevron-right" className="chevron-right" />
        </div>

        <div class="title">{{ t('supportFeedback') }}</div>

        <div v-for="{ icon, label, subLabel, url } in supportItems" class="about-item" :key="label" @click="open(url)">
          <div class="about-left-part">
            <Icon :icon="icon" class="icon" />

            <div class="item-descriptions">
              <div class="label">{{ t(label) }}</div>

              <div v-if="subLabel" class="sub-label">{{ subLabel }}</div>
            </div>
          </div>

          <Icon icon="chevron-right" className="chevron-right" />
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

  open(url: string) {
    window.open(url);

    this.handlerClose();
  }

  t(value: string) {
    return this.$t(`header.settings.about.${value}`);
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
      width: 24px;
      height: 24px;
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
