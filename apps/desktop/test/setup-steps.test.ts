import { describe, expect, it } from 'vitest';

import {
  type SetupStatus,
  firstStep,
  notificationView,
  stepAfterNotifications,
} from '../ui/src/setup-steps.ts';

const status = (overrides: Partial<SetupStatus> = {}): SetupStatus => ({
  notifications: 'notAsked',
  screenRecording: false,
  hotkey: 'Cmd+Shift+Digit2',
  ...overrides,
});

describe('firstStep', () => {
  it('welcomes a new install', () => {
    expect(firstStep(status())).toBe('welcome');
  });

  it('finishes after the Screen Recording restart', () => {
    expect(firstStep(status({ screenRecording: true, notifications: 'on' }))).toBe('done');
    expect(firstStep(status({ screenRecording: true, notifications: 'unavailable' }))).toBe('done');
  });

  it('goes straight to notifications for someone only missing those', () => {
    expect(firstStep(status({ screenRecording: true, notifications: 'off' }))).toBe(
      'notifications',
    );
  });
});

describe('stepAfterNotifications', () => {
  it('asks for Screen Recording only when it is missing', () => {
    expect(stepAfterNotifications(status())).toBe('screen');
    expect(stepAfterNotifications(status({ screenRecording: true }))).toBe('done');
  });
});

describe('notificationView', () => {
  it('asks first, then sends someone who turned them off to System Settings', () => {
    expect(notificationView('notAsked').action).toBe('request');
    expect(notificationView('off')).toMatchObject({
      action: 'open-settings',
      button: 'Open Notification Settings',
    });
    expect(notificationView('on').action).toBe('continue');
    expect(notificationView('unavailable').action).toBe('continue');
  });
});
