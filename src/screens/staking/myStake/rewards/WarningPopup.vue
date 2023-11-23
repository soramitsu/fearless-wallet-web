<template>
  <NotificationPopup
    acceptButtonText="common.proceed"
    rejectButtonText="common.cancel"
    sizeWidth="big"
    :showAcceptButton="true"
    :showRejectButton="true"
    :closeByBackground="false"
    :headers="headers"
    :handlerClose="handlerClose"
    :handlerAccept="handlerAccept"
  />
</template>

<script lang="ts" setup>
type Props = {
  handlerAccept: () => void;
  handlerClose?: () => void;
};

const headers = {
  text: 'common.areYouSure',
  subtext: 'staking.rewardLess',
};

const props = withDefaults(defineProps<Props>(), {
  handlerClose: () => null,
  handlerAccept: () => null,
});

const handlerAccept = props.handlerAccept;
const handlerClose = props.handlerClose;
</script>
