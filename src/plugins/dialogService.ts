import { ref } from 'vue';

type AlertDialog = {
  id: number;
  type: 'alert';
  title?: string;
  message: string;
  resolve: () => void;
};

type PromptDialog = {
  id: number;
  type: 'prompt';
  title?: string;
  message: string;
  defaultValue?: string;
  resolve: (value: { value: string | null }) => void;
};

type DialogRecord = AlertDialog | PromptDialog;

const activeDialog = ref<DialogRecord | null>(null);
const queue: DialogRecord[] = [];
let dialogId = 0;

const nextDialog = () => {
  if (activeDialog.value || queue.length === 0) return;

  activeDialog.value = queue.shift() ?? null;
};

const finalizeDialog = () => {
  activeDialog.value = null;
  nextDialog();
};

export const showAlertDialog = (payload: { message: string; title?: string }): Promise<void> =>
  new Promise((resolve) => {
    queue.push({
      id: ++dialogId,
      type: 'alert',
      title: payload.title,
      message: payload.message,
      resolve,
    });

    nextDialog();
  });

export const showPromptDialog = (payload: {
  message: string;
  title?: string;
  defaultValue?: string;
}): Promise<{ value: string | null }> =>
  new Promise((resolve) => {
    queue.push({
      id: ++dialogId,
      type: 'prompt',
      title: payload.title,
      message: payload.message,
      defaultValue: payload.defaultValue,
      resolve,
    });

    nextDialog();
  });

export const useDialogService = () => {
  const confirmAlert = () => {
    const current = activeDialog.value;

    if (current?.type !== 'alert') return;

    current.resolve();
    finalizeDialog();
  };

  const submitPrompt = (value: string | null) => {
    const current = activeDialog.value;

    if (current?.type !== 'prompt') return;

    current.resolve({ value });
    finalizeDialog();
  };

  return {
    dialog: activeDialog,
    confirmAlert,
    submitPrompt,
    cancelPrompt: () => submitPrompt(null),
  };
};
