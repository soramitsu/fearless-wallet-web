<template>
  <div class="mnemonic-confirmation-form">
    <p>{{ $t('addWallet.selectPassphraseWords') }}</p>
    <fieldset v-for="question in questions" :key="question.position">
      <legend>{{ $t('addWallet.wordNumber', { position: question.position }) }}</legend>
      <div class="choices">
        <label v-for="choice in question.choices" :key="choice">
          <input
            v-model="question.selected"
            type="radio"
            :name="`${groupId}-${question.position}`"
            :value="choice"
          />
          <span>{{ choice }}</span>
        </label>
      </div>
      <p role="status" class="feedback">
        <template v-if="question.selected && question.selected !== question.answer">{{ $t('addWallet.tryAnotherWord') }}</template>
      </p>
    </fieldset>
  </div>
</template>

<script lang="ts" setup>
import { ref, useId, watch, watchEffect } from 'vue';
import englishWords from 'bip39/src/wordlists/english.json';

const props = defineProps<{ mnemonic: string }>();
const emit = defineEmits<{ 'update:mnemonicConfirmed': [confirmed: boolean] }>();
const groupId = useId();
const questionCount = 3;

function drawWord(pool: string[]) {
  const index = Math.floor(Math.random() * pool.length);
  return pool.splice(index, 1)[0];
}

function makeQuestions(mnemonic: string) {
  const words = mnemonic.trim().split(/\s+/);
  if (words.length < questionCount) return [];

  // Ask for one position in each third, in the order it appears on the backup.
  return Array.from({ length: questionCount }, (_, group) => {
    const start = Math.floor(group * words.length / questionCount);
    const end = Math.floor((group + 1) * words.length / questionCount);
    const index = start + Math.floor(Math.random() * (end - start));
    const answer = words[index];
    const pool = englishWords.filter((word) => word !== answer);
    const choices = [drawWord(pool), drawWord(pool)];
    choices.splice(Math.floor(Math.random() * (choices.length + 1)), 0, answer);
    return { position: index + 1, choices, answer, selected: '' };
  });
}

const questions = ref<ReturnType<typeof makeQuestions>>([]);
watch(
  () => props.mnemonic,
  (mnemonic) => { questions.value = makeQuestions(mnemonic); },
  { immediate: true },
);
watchEffect(() => {
  const confirmed = questions.value.length === questionCount && questions.value.every(({ selected, answer }) => selected === answer);
  emit('update:mnemonicConfirmed', confirmed);
});
</script>

<style lang="scss" scoped>
.mnemonic-confirmation-form {
  display: grid;
  gap: 16px;
  max-width: 30rem;
  margin: 0 auto;
  text-align: start;

  p, fieldset {
    margin: 0;
  }

  fieldset {
    min-width: 0;
    border: 0;
    padding: 0;
  }

  legend {
    padding: 0 0 6px;
    font-weight: 600;
  }

  .choices {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 5.5rem), 1fr));
    gap: 6px;
  }

  label {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    min-height: 44px;
    border: $default-border;
    border-radius: 8px;
    background: $secondary-background-color;
    color: inherit;
    font-size: 0.875rem;
    cursor: pointer;
  }

  input {
    margin: 0;
    accent-color: palette($pink-lavender-color, var(--fw-select-edge));
  }

  label:has(:checked) {
    border-color: palette($pink-lavender-color, var(--fw-select-edge));
  }

  label:has(:focus-visible) {
    outline: 2px solid palette($pink-lavender-color, var(--fw-focus));
    outline-offset: -2px;
  }

  .feedback:not(:empty) {
    margin-top: 4px;
    font-size: 0.875rem;
  }
}
</style>
