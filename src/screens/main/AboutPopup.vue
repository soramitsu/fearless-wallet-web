<template>
  <div>
    <Popup
      :showBorder="true"
      :showAnimation="false"
      :showHeader="false"
      :width="410"
      :top="50"
      @handlerClose="$emit('handlerClose')"
      sizeWidth="big"
      verticalPlacement="top"
      horizontalPlacement="right"
    >
      <div class="about-popup">
        <div class="header">{{ t('about') }}</div>

        <div class="title">{{ $t('common.fearlessWallet') }}</div>

        <div class="item__container">
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
        </div>
        <div class="title">{{ t('communityWallet') }}</div>

        <div class="item__container">
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
        </div>
        <div class="title">{{ t('socialMedia') }}</div>

        <div class="item__container">
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
        </div>

        <div class="title">{{ t('supportFeedback') }}</div>
        <div class="item__container">
          <div
            v-for="{ icon, label, subLabel, url } in supportItems"
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
        </div>
      </div>
    </Popup>
  </div>
</template>

<script lang="ts" setup>
import { useI18n } from 'vue-i18n-composable';
import { MAIN_ITEMS, COMMUNITY_ITEMS, SOCIAL_MEDIA_ITEMS, SUPPORT_ITEMS } from '@/consts/extensionInformation';

const emit = defineEmits(['handlerClose']);
const locale = useI18n();
const mainItems = MAIN_ITEMS;
const communityItems = COMMUNITY_ITEMS;
const socialMediaItems = SOCIAL_MEDIA_ITEMS;
const supportItems = SUPPORT_ITEMS;

const t = (value: string) => locale.t(`common.${value}`);

const open = (url: string) => {
  window.open(url);

  emit('handlerClose');
};
</script>

<style lang="scss" scoped>
.about-popup {
  display: flex;
  flex-direction: column;
  text-align: left;
  padding: 0 $default-padding 7px;

  .item__container {
    display: flex;
    width: 100%;
    flex-direction: column;
    text-align: left;
    gap: 14px;
  }

  .item__container:not(:last-child) {
    margin-bottom: 32px;
  }

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
