import { nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, type Ref } from 'vue';

/** Modal keyboard navigation; contained panels keep the surrounding page's focus order. */
export function useModalFocus(element: Ref<HTMLElement | null>, enabled: () => boolean, dismiss: () => boolean) {
  let opener: HTMLElement | null = null;
  let active = false;
  const focusable = () =>
    Array.from(
      element.value?.querySelectorAll<HTMLElement>('button, input, textarea, select, a[href], [tabindex]') ?? []
    ).filter((candidate) => {
      if (
        candidate.matches(':disabled, [tabindex="-1"]') ||
        candidate.closest('[hidden], [inert], [aria-hidden="true"]')
      )
        return false;
      for (let current: HTMLElement | null = candidate; current; current = current.parentElement) {
        const style = getComputedStyle(current);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        if (current === element.value) break;
      }
      return true;
    });

  const activate = async () => {
    if (!enabled() || active) return;
    active = true;
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    await nextTick();
    if (active) (focusable()[0] ?? element.value)?.focus();
  };

  const deactivate = () => {
    if (
      active &&
      opener?.isConnected &&
      (element.value?.contains(document.activeElement) || document.activeElement === document.body)
    )
      opener.focus();
    active = false;
  };
  onMounted(activate);
  onActivated(activate);
  onDeactivated(deactivate);
  onBeforeUnmount(deactivate);

  return (event: KeyboardEvent) => {
    // A nested dialog owns its own keys, including when it has no dismiss action.
    if ((event.target as HTMLElement).closest('[role="dialog"]') !== element.value) return;
    if (event.key === 'Escape' && dismiss()) {
      event.preventDefault();
      event.stopPropagation();
    } else if (event.key === 'Tab' && enabled()) {
      const elements = focusable();
      const first = elements[0];
      const last = elements.at(-1);
      if (
        !first ||
        (event.shiftKey && document.activeElement === first) ||
        (!event.shiftKey && document.activeElement === last) ||
        document.activeElement === element.value
      ) {
        event.preventDefault();
        event.stopPropagation();
        (event.shiftKey ? (last ?? element.value) : (first ?? element.value))?.focus();
      }
    }
  };
}
