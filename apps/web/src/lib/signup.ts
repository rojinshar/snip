/** The waitlist form at the bottom of the home page, which /#signup leads to. */
export const SIGNUP_SECTION_ID = 'signup';
export const SIGNUP_INPUT_ID = 'signup-email';

/** Brings the waitlist form into view and puts the cursor in its email field. */
export function focusSignup(scroll: boolean): void {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (scroll) {
    document
      .getElementById(SIGNUP_SECTION_ID)
      ?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
  }
  // preventScroll: the scroll above (or the browser's own anchor jump) already placed it.
  document.getElementById(SIGNUP_INPUT_ID)?.focus({ preventScroll: true });
}
