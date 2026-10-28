import { invoke } from '@tauri-apps/api/core';

import { formatHotkey } from './hotkey.ts';
import {
  type NotificationAccess,
  type SetupStatus,
  type Step,
  firstStep,
  notificationView,
  stepAfterNotifications,
} from './setup-steps.ts';
import './style.css';
import './welcome.css';

/** How often to re-read permissions while the user is in System Settings. */
const POLL_MS = 1500;

const notificationsState = byId('notifications-state', HTMLParagraphElement);
const notificationsButton = byId('notifications-button', HTMLButtonElement);
const screenButton = byId('screen-button', HTMLButtonElement);
const screenSteps = byId('screen-steps', HTMLOListElement);
const screenState = byId('screen-state', HTMLParagraphElement);
const restartButton = byId('restart-button', HTMLButtonElement);
const doneNotice = byId('done-notice', HTMLParagraphElement);

let status: SetupStatus | undefined;
let poll: number | undefined;
let restarting = false;

function byId<T extends HTMLElement>(id: string, type: new () => T): T {
  const element = document.getElementById(id);
  if (!(element instanceof type)) throw new Error(`#${id} is missing from welcome.html`);
  return element;
}

async function refresh(): Promise<SetupStatus> {
  status = await invoke<SetupStatus>('get_setup_status');
  for (const label of document.querySelectorAll('.hotkey-label')) {
    label.textContent = formatHotkey(status.hotkey);
  }
  return status;
}

function show(step: Step): void {
  window.clearInterval(poll);
  poll = undefined;
  for (const section of document.querySelectorAll<HTMLElement>('[data-step]')) {
    section.hidden = section.dataset.step !== step;
  }
  for (const dot of document.querySelectorAll<HTMLElement>('[data-dot]')) {
    dot.classList.toggle('current', dot.dataset.dot === step);
  }
  if (step === 'notifications') {
    renderNotifications(status?.notifications ?? 'notAsked');
    // Picks up the change when the user flips the switch in System Settings.
    poll = window.setInterval(() => {
      void refresh().then((s) => {
        renderNotifications(s.notifications);
      });
    }, POLL_MS);
  }
  if (step === 'done') {
    doneNotice.hidden = status?.notifications !== 'off';
  }
  document.querySelector<HTMLButtonElement>(`[data-step="${step}"] .primary`)?.focus();
}

function renderNotifications(access: NotificationAccess): void {
  const view = notificationView(access);
  notificationsState.textContent = view.message;
  notificationsState.classList.toggle('ok', access === 'on');
  notificationsButton.textContent = view.button;
  notificationsButton.dataset.action = view.action;
}

async function onNotificationsButton(): Promise<void> {
  const action = notificationsButton.dataset.action;
  if (action === 'continue') {
    show(stepAfterNotifications(await refresh()));
  } else if (action === 'request') {
    notificationsButton.disabled = true;
    try {
      renderNotifications(await invoke<NotificationAccess>('request_notifications'));
      await refresh();
    } finally {
      notificationsButton.disabled = false;
    }
  } else {
    await invoke('open_notification_settings');
  }
}

async function onScreenButton(): Promise<void> {
  if (await invoke<boolean>('request_screen_recording')) {
    await restart();
    return;
  }
  screenSteps.hidden = false;
  restartButton.hidden = false;
  screenButton.textContent = 'Open Screen Recording Settings';
  window.clearInterval(poll);
  // If macOS reports the permission without a relaunch, restart for the user; otherwise its
  // own "Quit & Reopen" (or the Restart button) brings Snip back to this window.
  poll = window.setInterval(() => {
    void refresh().then((s) => {
      if (s.screenRecording) void restart();
    });
  }, POLL_MS);
}

async function restart(): Promise<void> {
  if (restarting) return;
  restarting = true;
  window.clearInterval(poll);
  screenState.textContent = 'Restarting Snip…';
  screenState.classList.add('ok');
  await invoke('restart_snip');
}

const actions: Record<string, () => void | Promise<void>> = {
  // Always notifications next, before Screen Recording: that step restarts Snip, and an
  // earlier version skipped straight to it when macOS already reported notifications on.
  start: () => {
    show('notifications');
  },
  'skip-notifications': async () => {
    show(stepAfterNotifications(await refresh()));
  },
  screen: onScreenButton,
  restart,
  finish: () => invoke('finish_setup'),
};

document.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;
  if (target === notificationsButton) {
    void onNotificationsButton();
    return;
  }
  const action = target.dataset.action;
  if (action !== undefined && action in actions) void actions[action]?.();
});

refresh().then(
  (s) => {
    show(firstStep(s));
  },
  () => {
    show('welcome');
  },
);
