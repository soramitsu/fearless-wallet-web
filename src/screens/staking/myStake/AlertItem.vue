<template>
  <div class="alert-item" data-testid="alertItem">
    <Icon icon="info-triangle" className="img" :hover="false" />

    <div class="full-descriptions">
      <div class="name" data-testid="alertName">{{ tName }}</div>
      <div class="descriptions" data-testid="alertDescription">{{ tDescriptions }}</div>
      <div class="date" data-testid="alertDate">{{ date }}</div>
    </div>

    <Icon icon="chevron-right" class="img chevron" data-testid="alertDetails" @click="click" />
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { getFormattedDate } from '@/helpers';

const props = defineProps<{
  name: string;
  timespan: number;
  formName: string;
}>();

const emit = defineEmits<{
  openForm: [formName: string];
}>();

const { t } = useI18n();

const date = computed(() => getFormattedDate(props.timespan, 'ms'));
const tName = computed(() => t(`staking.alertsList.${props.name}.name`));
const tDescriptions = computed(() => t(`staking.alertsList.${props.name}.text`));

function click() {
  emit('openForm', props.formName);
}
</script>

<style lang="scss" scoped>
.alert-item {
  display: flex;
  align-items: flex-start;
  border-bottom: $secondary-border;
  padding: 15px 0;

  &:last-child {
    border-bottom: none;
  }

  .img {
    width: 42px;
    height: 21px;
  }

  .chevron {
    color: $grayish-white-2;
  }

  .full-descriptions {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    text-align: left;
    margin: 0 8px;

    .name {
      font-size: 1em;
      font-weight: 600;
      color: #ffffffcc;
    }

    .descriptions {
      font-size: 0.875em;
      color: $grayish-white;
      margin: 7px 0;
      width: 425px;
    }

    .date {
      font-size: 0.75rem;
      color: $grayish-white-2;
    }
  }
}
</style>
