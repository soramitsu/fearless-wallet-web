<template>
  <Scroll>
    <div class="validator-info">
      <FInput
        :value="address"
        :placeholder="validatorName"
        size="big"
        data-testid="validatorNameInput"
        :readonly="true"
      />

      <ContentForm :height="validatorFormHeight" :isStaticHeight="true" :bottomRightCorner="true" class="about-staking">
        <div class="label" data-testid="stakingLabel">{{ $t('browserTabs.staking') }}</div>

        <InfoRow text="common.status" data-testid="status" :value="status" :showBorder="!showSlashedWarning" />

        <Hint v-if="showSlashedWarning" iconName="warning" text="staking.validatorSlashed" class="hint" />

        <InfoRow
          text="staking.nominators"
          data-testid="nominators"
          :value="`${nominatorsCount} (${$t('common.max')} ${maxNominatorRewardedPerValidator})`"
          borderType="default"
          :showBorder="!showOversubscribedWarning"
        />

        <Hint v-if="showOversubscribedWarning" iconName="warning" text="staking.oversubscribedOnly" />

        <InfoRow
          text="staking.totalStake"
          data-testid="totalStake"
          :value="`${totalStakeString} ${stakingAssetName}`"
          :price="totalStakeValue"
        />

        <InfoRow
          text="staking.estimatedRewards"
          data-testid="estimatedRewards"
          :value="`${apy}% APY`"
          borderType="default"
        />
      </ContentForm>

      <ContentForm :height="315" :isStaticHeight="true" :bottomRightCorner="true">
        <Scroll>
          <div class="form-layout">
            <div class="label" data-testid="identityLabel">{{ $t('staking.identity') }}</div>

            <InfoRow text="staking.legalName" :value="legalName" borderType="default" data-testid="legalName" />

            <InfoRow
              text="common.email"
              :value="email"
              borderType="default"
              color="pink-lavender"
              data-testid="email"
            />

            <InfoRow text="staking.web" :value="web" borderType="default" color="pink-lavender" data-testid="web" />

            <InfoRow
              text="common.twitter"
              :value="twitter"
              borderType="default"
              color="pink-lavender"
              data-testid="twitter"
            />

            <InfoRow
              text="staking.elementName"
              :value="elementName"
              borderType="default"
              color="pink-lavender"
              data-testid="elementName"
            />
          </div>
        </Scroll>
      </ContentForm>
    </div>
  </Scroll>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { FWValidatorInfoFull } from '@extension-base/services/staking-service/types';
import type { NetworkParams } from '@/stores';
import type { TokenGroup } from '@extension-base/background/types/types';
import Scroll from '@/components/Scroll.vue';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

const props = defineProps<{
  stakingNetwork: NetworkParams;
  stakingCurrency: TokenGroup;
  validator: FWValidatorInfoFull;
  validators: FWValidatorInfoFull[];
}>();

const networksStore = useNetworksStore();
const accountsStore = useAccountsStore();
const { t, n } = useI18n();

const stakingAssetPrice = computed(() => networksStore.getAssetPrice(props.stakingCurrency?.priceId ?? '').price);

const showOversubscribedWarning = computed(() => props.validator.isOversubscribed);
const showSlashedWarning = computed(() => false);

const validatorFormHeight = computed(
  () => 355 - (showOversubscribedWarning.value ? 55 : 0) - (showSlashedWarning.value ? 55 : 0)
);

const stakingAssetName = computed(() => props.stakingCurrency.symbol);
const address = computed(() => props.validator.address);
const validatorName = computed(() => props.validator.name);
const nominatorsCount = computed(() => props.validator.nominators.length);
const legalName = computed(() => props.validator.identity?.info.legal ?? '');
const email = computed(() => props.validator.identity?.info.email ?? '');
const web = computed(() => props.validator.identity?.info.web ?? '');
const twitter = computed(() => props.validator.identity?.info.twitter ?? '');
const elementName = computed(() => props.validator.identity?.info.description ?? '');
const maxNominatorRewardedPerValidator = computed(() => props.stakingNetwork.maxNominatorRewardedPerValidator);
const apy = computed(() => props.validator?.apy ?? 0);
const totalStake = computed(() => props.validator.stake.total ?? '0');
const totalStakeString = computed(() => n(+totalStake.value, 'decimal'));
const totalStakeValue = computed(() => {
  const value = +totalStake.value * stakingAssetPrice.value;

  return `${accountsStore.fiatSymbol}${n(value, 'price')}`;
});

const status = computed(() => t(`staking.${props.validator.status}`));
</script>

<style lang="scss" scoped>
.validator-info {
  .label {
    margin: 16px 16px 0;
    font-weight: 600;
    text-align: left;
    color: $default-white;
  }

  .about-staking {
    margin: 15px 0;
  }

  .hint {
    margin: 0 16px;
    border-bottom: $default-border;
    padding-bottom: 10px;
  }
}
</style>
