<template>
  <AboveForm :blur="true" header="Authorize" :closeHandler="onClick">
    <div class="authorize">
      <div>
        <p class="authorize__content">
          An application, self-identifying as
          <span class="authorize__content--name">{{ name }}</span> is requesting access from my
          <span class="authorize__content--link">{{ url }}</span>
        </p>
        <Alert :message="alertMessage" />
      </div>
      <div class="authorize__control">
        <Button
          width="100%"
          text="Yes, allow this application access"
          size="big"
          fontSize="big"
          @click="$emit('authorizeApp')"
        />
        <Button width="100%" type="link" text="Reject" size="big" fontSize="medium" @click="$emit('rejectApp')" />
      </div>
    </div>
  </AboveForm>
</template>

<script lang="ts">
import { Vue, Prop, Component } from 'vue-property-decorator';
import Button from '@/components/Button.vue';
import Hint from '@/components/Hint.vue';
import Alert from '@/screens/authorize/Alert.vue';
import AboveForm from '@/components/AboveForm.vue';

@Component({
  components: {
    Button,
    AboveForm,
    Alert,
    Hint,
  },
})
export default class Authorize extends Vue {
  @Prop(String) url!: string;
  @Prop(String) name!: string;
  alertMessage =
    'Only approve this request if you trust the application. Approving gives the application access to the addresses of you accounts';

  onClick(event: Event) {
    console.info(event.target);
  }
}
</script>

<style lang="scss" scoped>
.authorize {
  display: flex;
  flex-flow: column;
  justify-content: space-between;
  height: 90%;

  .authorize__content {
    font-size: 16px;
    font-weight: 400px;
    margin-bottom: 20px;
  }
  .authorize__content--name {
    color: #bb77ff;
  }
  .authorize__content--link {
    color: #bb77ff;
    cursor: pointer;
  }

  .authorize__control {
    display: flex;
    flex-flow: column;
    justify-content: space-between;
    height: 110px;
  }
}
</style>
