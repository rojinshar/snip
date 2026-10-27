/** The hero waitlist form, which /#signup and the nav button lead to. */
export const SIGNUP_SECTION_ID = 'signup';
export const SIGNUP_INPUT_ID = 'hero-email';

/** Brings the hero form into view and puts the cursor in its email field. */
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
