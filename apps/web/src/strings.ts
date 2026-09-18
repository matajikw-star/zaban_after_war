// Every Persian string in apps/web lives here and nowhere else (what.md §17.5).
// Components reference keys; they never hold a literal.

// Vite replaces `import.meta.env` at build time. `vite.config.ts` imports this module while
// running under plain Node, where there is no `import.meta.env` at all — hence the cast and the
// optional chain, which keep the fallback name defined in exactly one place.
const env = import.meta.env as ImportMetaEnv | undefined;

/** Used until the owner settles the Persian name (what.md §19, product-brief Q41). */
export const DEFAULT_APP_NAME = 'کنکور لایتنر';

export const strings = {
  appName: env?.VITE_APP_NAME || DEFAULT_APP_NAME,

  /** Screen titles, keyed by the screen folder name (what.md §7.8). */
  screens: {
    onboarding: 'شروع',
    home: 'خانه',
    review: 'مرور',
    sessionSummary: 'پایان جلسه',
    boxes: 'جعبه‌ها',
    word: 'واژه',
    progress: 'پیشرفت',
    paywall: 'خرید نسخهٔ کامل',
    login: 'ورود',
    checkout: 'پرداخت',
    purchaseResult: 'نتیجهٔ خرید',
    settings: 'تنظیمات',
    season: 'جمع‌بندی فصل',
    notFound: 'صفحه پیدا نشد',
  },

  home: {
    startReview: 'شروع مرور',
    version: 'نسخه',
  },

  /** The top-level React error boundary (what.md §10.1). */
  crash: {
    title: 'مشکلی پیش آمد',
    body: 'گزارش این خطا ذخیره شد و در اولین اتصال به اینترنت فرستاده می‌شود. پیشرفت شما جای خود امن است.',
    goHome: 'بازگشت به خانه',
  },

  /** Placeholder shown by every screen that is only a shell after ticket 01. */
  placeholder: 'این صفحه در مرحلهٔ بعد ساخته می‌شود.',

  common: {
    loading: 'در حال آماده‌سازی…',
  },

  a11y: {
    goalRing: 'حلقهٔ هدف امروز',
    progressBar: 'نوار پیشرفت',
  },

  /** The review screen (what.md §7.8). Appended as one block by the review ticket. */
  review: {
    back: 'بازگشت',
    end: 'پایان',
    overflow: 'گزینه‌های بیشتر',
    tapToReveal: 'برای دیدن معنی لمس کنید',
    empty: 'فعلاً کلمه‌ای برای مرور نیست.',

    // The exam badge: «۲ بار در کنکور، آخرین بار ۱۴۰۲».
    examTimes: 'بار در کنکور',
    examLastYear: 'آخرین بار',

    gradeForgot: 'بلد نبودم',
    gradeKnew: 'بلد بودم',

    more: 'بیشتر',
    definition: 'تعریف',
    pronunciation: 'تلفظ',
    synonyms: 'مترادف‌ها',
    antonyms: 'متضادها',
    otherSenses: 'معنی‌های دیگر',
    homograph: 'این املا بیش از یک معنی دارد.',
    confusables: 'کلمه‌های شبیه',
    examHistory: 'سابقهٔ کنکور',
    question: 'سؤال',

    hintTitle: 'راهنمای یادگیری',
    hintSoon: 'راهنمای این کلمه به‌زودی اضافه می‌شود.',

    know: 'این را بلدم',
    flag: 'این کلمه اشکال دارد',
    flagQuestion: 'کدام بخش مشکل دارد؟',
    flagTranslation: 'معنی درست نیست',
    flagExample: 'مثال اشکال دارد',
    flagHint: 'راهنما اشکال دارد',
    flagCancel: 'انصراف',
    flagRecorded: 'ثبت شد',

    // Feedback after a grade: «جعبهٔ ۱ ← جعبهٔ ۲» and «دفعهٔ بعد: ۲ روز دیگر».
    box: 'جعبهٔ',
    boxNew: 'تازه',
    conquered: 'فتح شد',
    nextDue: 'دفعهٔ بعد',
    inMinutes: 'دقیقه دیگر',
    inHours: 'ساعت دیگر',
    inDays: 'روز دیگر',

    goalTitle: 'به هدف امروز رسیدی',
    goalBody: 'می‌توانی همین‌جا استراحت کنی، یا اگر حالش را داری ادامه بدهی.',
    goalContinue: 'ادامه می‌دهم',
    goalFinish: 'پایان جلسه',
  },

  /** The paywall (what.md §7.8). Placeholder copy until Phase 5 builds the real screen. */
  paywall: {
    pace: 'نسخهٔ رایگان ۱۵۰ کلمه دارد. با نسخهٔ کامل، همهٔ کلمه‌هایی که ده سال اخیر در کنکور آمده‌اند به مرور می‌رسند و پیش از روز آزمون تمام می‌شوند.',
    soon: 'خرید در مرحلهٔ بعد فعال می‌شود.',
    later: 'بعداً',
  },
} as const;

export type Strings = typeof strings;
