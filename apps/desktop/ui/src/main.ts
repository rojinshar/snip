import { invoke } from '@tauri-apps/api/core';

import { formatHotkey, hotkeyFromKeyPress } from './hotkey.ts';
import './style.css';

type Delimiters = 'inlineDollar' | 'displayBracket' | 'displayDollar' | 'none';

/** Mirrors `Settings` in src-tauri/src/settings.rs. */
interface Settings {
  readonly hotkey: string;
  readonly delimiters: Delimiters;
}

const hotkeyButton = byId('hotkey', HTMLButtonElement);
const delimiterInputs = document.querySelectorAll<HTMLInputElement>('input[name="delimiters"]');
const status = byId('status', HTMLParagraphElement);
const keyState = byId('key-state', HTMLParagraphElement);
const keyForm = byId('key-form', HTMLFormElement);
const keyInput = byId('key-input', HTMLInputElement);
const keyRemove = byId('key-remove', HTMLButtonElement);

let settings: Settings | undefined;
let recording = false;

function byId<T extends HTMLElement>(id: string, type: new () => T): T {
  const element = document.getElementById(id);
  if (!(element instanceof type)) throw new Error(`#${id} is missing from index.html`);
  return element;
}

function render(next: Settings): void {
  settings = next;
  hotkeyButton.textContent = formatHotkey(next.hotkey);
  for (const input of delimiterInputs) input.checked = input.value === next.delimiters;
}

function showError(error: unknown): void {
  status.textContent = typeof error === 'string' ? error : 'Something went wrong. Try again.';
}

/** Shows the saved key's hint (`snip_…k3q7`), never the key. */
function renderKey(hint: string | null): void {
  keyState.textContent =
    hint === null ? 'Not set. Paste the key from your invite.' : `Saved: ${hint}`;
  keyRemove.hidden = hint === null;
  keyInput.value = '';
}

async function onKeySubmit(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  try {
    renderKey(await invoke<string>('set_access_key', { key: keyInput.value }));
    status.textContent = '';
  } catch (error) {
    showError(error);
  }
}

async function onKeyRemove(): Promise<void> {
  try {
    await invoke('clear_access_key');
    renderKey(null);
    status.textContent = '';
  } catch (error) {
    showError(error);
  }
}

async function startRecording(): Promise<void> {
  if (recording) return;
  // Release the global hotkey so pressing it here records it instead of starting a snip.
  await invoke('pause_hotkey');
  recording = true;
  status.textContent = '';
  hotkeyButton.classList.add('recording');
  hotkeyButton.textContent = 'Press keys…';
}

async function stopRecording(): Promise<void> {
  if (!recording) return;
  recording = false;
  hotkeyButton.classList.remove('recording');
  if (settings) render(settings);
  try {
    await invoke('resume_hotkey');
  } catch (error) {
    showError(error);
  }
}

async function onKeyDown(event: KeyboardEvent): Promise<void> {
  if (!recording) return;
  event.preventDefault();
  const plain = !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey;
  if (event.code === 'Escape' && plain) {
    await stopRecording();
    return;
  }
  const hotkey = hotkeyFromKeyPress(event);
  if (hotkey === null) return;
  try {
    render(await invoke<Settings>('set_hotkey', { hotkey }));
  } catch (error) {
    showError(error);
  }
  await stopRecording();
}

async function onDelimitersChange(event: Event): Promise<void> {
  const { value } = event.target as HTMLInputElement;
  try {
    render(await invoke<Settings>('set_delimiters', { delimiters: value }));
    status.textContent = '';
  } catch (error) {
    showError(error);
    if (settings) render(settings);
  }
}

hotkeyButton.addEventListener('click', () => void startRecording());
hotkeyButton.addEventListener('blur', () => void stopRecording());
window.addEventListener('keydown', (event) => void onKeyDown(event));
for (const input of delimiterInputs) {
  input.addEventListener('change', (event) => void onDelimitersChange(event));
}

keyForm.addEventListener('submit', (event) => void onKeySubmit(event));
keyRemove.addEventListener('click', () => void onKeyRemove());

invoke<Settings>('get_settings').then(render, showError);
invoke<string | null>('get_access_key_hint').then(renderKey, showError);
