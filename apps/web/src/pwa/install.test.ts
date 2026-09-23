import { describe, expect, it } from 'vitest';
import { detectInstallContext, type InstallContextInput } from './install.ts';

const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36';

const IOS_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

const IOS_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1';

const TELEGRAM_ANDROID =
  'Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A.230901.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/122.0.0.0 Mobile Safari/537.36 Telegram-Android/10.14.0 (Pixel 7)';

const TELEGRAM_WEBVIEW =
  'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 tgWebAppPlatform/android';

const INSTAGRAM_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 321.0.0.28.106';

const FACEBOOK_ANDROID =
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/128.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/450.0.0.0.0;]';

const DESKTOP_CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

function input(over: Partial<InstallContextInput>): InstallContextInput {
  return { userAgent: ANDROID_CHROME, standalone: false, hasNativePrompt: false, ...over };
}

describe('detectInstallContext', () => {
  it('is "installed" whenever the display mode is standalone, regardless of UA', () => {
    expect(detectInstallContext(input({ standalone: true, userAgent: IOS_SAFARI }))).toBe(
      'installed',
    );
    expect(
      detectInstallContext({ userAgent: ANDROID_CHROME, standalone: true, hasNativePrompt: true }),
    ).toBe('installed');
  });

  it('is "native" on Android Chrome once beforeinstallprompt has been captured', () => {
    expect(detectInstallContext(input({ hasNativePrompt: true }))).toBe('native');
  });

  it('is "unavailable" on Android Chrome before the prompt has fired', () => {
    expect(detectInstallContext(input({}))).toBe('unavailable');
  });

  it('detects Telegram in-app browsers', () => {
    expect(detectInstallContext(input({ userAgent: TELEGRAM_ANDROID }))).toBe('in-app-browser');
    expect(detectInstallContext(input({ userAgent: TELEGRAM_WEBVIEW }))).toBe('in-app-browser');
  });

  it('detects Instagram and Facebook in-app browsers', () => {
    expect(detectInstallContext(input({ userAgent: INSTAGRAM_IOS }))).toBe('in-app-browser');
    expect(detectInstallContext(input({ userAgent: FACEBOOK_ANDROID }))).toBe('in-app-browser');
  });

  it('an in-app browser wins over a captured native prompt', () => {
    expect(
      detectInstallContext({
        userAgent: TELEGRAM_ANDROID,
        standalone: false,
        hasNativePrompt: true,
      }),
    ).toBe('in-app-browser');
  });

  it('is "ios" for iOS Safari', () => {
    expect(detectInstallContext(input({ userAgent: IOS_SAFARI }))).toBe('ios');
  });

  it('is not "ios" for Chrome-on-iOS, which cannot add to home screen the same way', () => {
    expect(detectInstallContext(input({ userAgent: IOS_CHROME }))).toBe('unavailable');
  });

  it('is "unavailable" on a desktop browser with no native prompt', () => {
    expect(detectInstallContext(input({ userAgent: DESKTOP_CHROME }))).toBe('unavailable');
  });
});
