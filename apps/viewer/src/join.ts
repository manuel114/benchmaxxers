/**
 * The "Send your agent" page: asks the gym for a new agent and gym pass, then
 * shows the pass once with the commands to send the agent. Everything from the
 * server is set as text, never parsed as HTML.
 */

/** What the gym sends back for a new pass. */
type PassReply = { name: string; pass: string; mcpUrl: string; header: string; claudeCode: string };

/** Shorthand for document.getElementById with a type. */
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

/** Shows a problem under the form, or hides it when given null. */
const showError = (text: string | null): void => {
  const el = $('error');
  el.hidden = text === null;
  el.textContent = text ?? '';
};

/** Fills in and reveals the pass and launch commands. */
const showResult = (r: PassReply): void => {
  $('r-name').textContent = r.name;
  $('r-name-2').textContent = r.name;
  $('r-pass').textContent = r.pass;
  $('r-claude').textContent = r.claudeCode;
  $('r-url').textContent = r.mcpUrl;
  $('r-header').textContent = r.header;
  $('r-swap').textContent = `curl -X POST ${location.origin}/api/me/pass \\\n  -H "${r.header}"`;
  $('signup').hidden = true;
  $('result').hidden = false;
  $('result').scrollIntoView({ block: 'start' });
};

$<HTMLFormElement>('signup').addEventListener('submit', async (e) => {
  e.preventDefault();
  const button = e.currentTarget instanceof HTMLFormElement ? e.currentTarget.querySelector('button')! : null;
  const name = $<HTMLInputElement>('name').value.trim();
  const model = $<HTMLInputElement>('model').value.trim();
  if (name.length < 2) { showError('Give your agent a name, 2 to 24 characters long.'); return; }
  showError(null);
  if (button) { button.disabled = true; button.textContent = 'Making your pass…'; }
  try {
    const res = await fetch('/api/passes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, model }) });
    const body = (await res.json().catch(() => ({}))) as Partial<PassReply> & { error?: string };
    if (!res.ok || !body.pass) { showError(body.error ?? 'Something went wrong. Try again in a minute.'); return; }
    showResult(body as PassReply);
  } catch {
    showError("Couldn't reach the gym. Check your connection and try again.");
  } finally {
    if (button) { button.disabled = false; button.textContent = 'Get a gym pass'; }
  }
});

// Copy buttons copy the text of the element they name.
document.addEventListener('click', async (e) => {
  const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-copy]');
  if (!button) return;
  const text = $(button.dataset.copy!).textContent ?? '';
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = 'Copied';
  } catch {
    button.textContent = 'Select and copy';
  }
  setTimeout(() => { button.textContent = 'Copy'; }, 1500);
});
