/** Mirrors `NotificationAccess` in src-tauri/src/notification_access.rs. */
export type NotificationAccess = 'notAsked' | 'on' | 'off' | 'unavailable';

export type Step = 'welcome' | 'notifications' | 'screen' | 'done';

/** Mirrors `SetupStatus` in src-tauri/src/welcome_window.rs. */
export interface SetupStatus {
  readonly notifications: NotificationAccess;
  readonly screenRecording: boolean;
  readonly hotkey: string;
}

/**
 * Where the window opens. With Screen Recording already allowed (back from the restart, or
 * an existing user only missing notifications) there is no point repeating the welcome.
 */
export function firstStep(status: SetupStatus): Step {
  if (!status.screenRecording) return 'welcome';
  return status.notifications === 'off' || status.notifications === 'notAsked'
    ? 'notifications'
    : 'done';
}

/** After notifications: Screen Recording, unless it's already allowed. */
export function stepAfterNotifications(status: SetupStatus): Step {
  return status.screenRecording ? 'done' : 'screen';
}

export interface NotificationView {
  readonly message: string;
  readonly button: string;
  readonly action: 'request' | 'open-settings' | 'continue';
}

/** What the notifications step says and does for each permission state. */
export function notificationView(access: NotificationAccess): NotificationView {
  switch (access) {
    case 'notAsked':
      return {
        message: 'macOS will ask. Choose Allow.',
        button: 'Allow notifications',
        action: 'request',
      };
    case 'on':
      return { message: '✓ Notifications are on.', button: 'Continue', action: 'continue' };
    case 'off':
      return {
        message:
          'Notifications are off for Snip. In System Settings, turn on Allow notifications and pick Banners.',
        button: 'Open Notification Settings',
        action: 'open-settings',
      };
    case 'unavailable':
      return {
        message: "Notifications can't be checked in a development build.",
        button: 'Continue',
        action: 'continue',
      };
  }
}
