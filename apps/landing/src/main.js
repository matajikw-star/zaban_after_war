// The landing page ships no framework and, at Phase 1, no behaviour.
// Phase 6 fills this in: Telegram and Instagram in-app browsers never fire
// `beforeinstallprompt`, so the page detects them and offers «در Chrome باز کنید»
// plus the APK download (what.md §12, §7.8).

/** @returns {boolean} true when the page is inside a known in-app browser. */
export function isInAppBrowser() {
  // TODO(Phase 6): UA sniff for Telegram / Instagram / FBAV and swap the install CTA.
  return false;
}
