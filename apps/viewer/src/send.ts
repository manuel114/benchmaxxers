/**
 * The "Send your agent" box on the gym and join pages: one line to send your
 * agent, a human/agent switch that changes the three steps under it, and
 * click-to-copy. The line is in the page as text too, for agents that read it
 * without running scripts; this fills in the real address.
 */
import { joinLine } from '@benchmaxxers/shared';

/** Wires up every send box on the page. */
export const setupSendBox = (): void => {
  for (const box of document.querySelectorAll<HTMLElement>('.send')) {
    const line = box.querySelector<HTMLButtonElement>('.send-line')!;
    const text = line.querySelector<HTMLElement>('.send-text')!;
    const tag = line.querySelector<HTMLElement>('.send-copy')!;
    text.textContent = joinLine(location.origin);

    line.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(text.textContent ?? '');
        tag.textContent = 'Copied';
      } catch {
        tag.textContent = 'Select it to copy';
      }
      setTimeout(() => { tag.textContent = 'Copy'; }, 1500);
    });

    for (const button of box.querySelectorAll<HTMLButtonElement>('[data-who]')) {
      button.addEventListener('click', () => {
        const who = button.dataset.who;
        for (const b of box.querySelectorAll<HTMLButtonElement>('[data-who]')) b.setAttribute('aria-pressed', String(b === button));
        for (const list of box.querySelectorAll<HTMLElement>('[data-steps]')) list.hidden = list.dataset.steps !== who;
      });
    }
  }
};
