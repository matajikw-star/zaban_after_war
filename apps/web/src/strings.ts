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
    todayGoalCaption: 'هدف امروز',
    goalOf: (goal: string) => `از ${goal}`,
    streakDays: (days: string) => `${days} روز پیاپی`,
    progressLine: (percent: string, conquered: string, total: string) =>
      `${percent} — ${conquered} از ${total} کلمه فتح‌شده`,
    updateReady: 'نسخهٔ جدید آماده است — اعمال',
    backupSynced: 'پشتیبان‌گیری شده',
    backupPending: 'در انتظار پشتیبان‌گیری',
    nav: {
      home: 'خانه',
      boxes: 'جعبه‌ها',
      progress: 'پیشرفت',
      settings: 'تنظیمات',
    },
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

    // Once, after 50 presentations on an anonymous install (what.md §7.4).
    saveProgressTitle: 'ذخیرهٔ پیشرفت با شمارهٔ موبایل',
    saveProgressBody:
      'پیشرفتت الان فقط روی همین گوشی است. با شمارهٔ موبایل وارد شو تا خودکار پشتیبان‌گیری شود و روی هر گوشی دیگری برگردد.',
    saveProgressAccept: 'ورود با شمارهٔ موبایل',
    saveProgressLater: 'بعداً',
  },

  /** The paywall (what.md §7.8). Placeholder copy until Phase 5 builds the real screen. */
  paywall: {
    pace: 'نسخهٔ رایگان ۱۵۰ کلمه دارد. با نسخهٔ کامل، همهٔ کلمه‌هایی که ده سال اخیر در کنکور آمده‌اند به مرور می‌رسند و پیش از روز آزمون تمام می‌شوند.',
    soon: 'خرید در مرحلهٔ بعد فعال می‌شود.',
    later: 'بعداً',
  },

  boxes: {
    boxPrefix: (n: string) => `جعبهٔ ${n}`,
    unseen: 'دیده‌نشده',
    unseenCount: (n: string) => `${n} کلمهٔ دیده‌نشده`,
    empty: 'کلمه‌ای در این جعبه نیست',
    nextDue: 'مرور بعدی',
    dueNow: 'الان',
    back: 'بازگشت',
    wordsCount: (n: string) => `${n} کلمه`,
  },

  word: {
    know: 'این را بلدم',
    // The three reasons themselves are `screens/review/FlagSheet.tsx`'s `FLAG_REASONS` (codes with
    // `review.flagTranslation` / `flagExample` / `flagHint` as labels) — one set, reused here
    // rather than duplicated (ticket dev-web/07).
    flag: 'این کلمه اشکال دارد',
    flagTitle: 'دلیل مشکل چیست؟',
    flagSent: 'گزارش شما ثبت شد',
    historyTitle: 'تاریخچهٔ مرور',
    noHistory: 'هنوز مروری ثبت نشده',
    examTitle: 'سابقهٔ کنکور',
    examTimesTested: (n: string) => `${n} بار در کنکور`,
    examYears: (years: string) => `سال‌های ${years}`,
    noExam: 'به‌عنوان واژهٔ زمینه انتخاب شده، نه از یک سؤال مستقیم',
    definitionTitle: 'تعریف',
    confusablesTitle: 'قابل اشتباه با',
    back: 'بازگشت',
    notFound: 'این واژه در بستهٔ فعلی موجود نیست',
  },

  progress: {
    ruleSentence: 'هر بار که یک کلمه در کنکور آمده، یک امتیاز',
    conqueredLine: (conquered: string, total: string) => `${conquered} از ${total} کلمه فتح‌شده`,
    chartTitle: 'مرورهای ۳۰ روز اخیر',
    paceAhead: (needed: string, left: string) =>
      `با این سرعت ${needed} روز لازم است، ${left} روز مانده — جلوتر از برنامه‌اید`,
    paceOk: (needed: string, left: string) =>
      `با این سرعت ${needed} روز لازم است، ${left} روز مانده`,
    paceBehind: (needed: string, left: string) =>
      `با این سرعت ${needed} روز لازم است، ${left} روز مانده — کمی عقب‌اید`,
    noExamDate: 'تاریخ کنکور ثبت نشده',
    raiseGoal: 'افزایش هدف روزانه',
  },

  summary: {
    presentations: 'ارائه‌شده',
    accuracy: 'دقت',
    conqueredToday: 'فتح‌شدهٔ امروز',
    streak: 'روز پیاپی',
    continue: 'ادامه',
    home: 'خانه',
  },

  settings: {
    accountTitle: 'حساب کاربری',
    accountLoggedOut: 'ورود',
    goalTitle: 'هدف روزانه',
    minutesOption: (n: string) => `${n} دقیقه`,
    dailyGoalCaption: (n: string) => `${n} ارائه در روز`,
    examDateTitle: 'تاریخ کنکور',
    examDatePlaceholder: '۱۴۰۵/۱۱/۱۵',
    examDateClear: 'حذف تاریخ',
    fieldTitle: 'رشتهٔ تحصیلی',
    fieldNone: 'انتخاب نشده',
    themeTitle: 'پوسته',
    themeSystem: 'سیستم',
    themeLight: 'روشن',
    themeDark: 'تیره',
    backupTitle: 'پشتیبان‌گیری',
    backupIdle: 'به‌روز',
    backupPushing: 'در حال ارسال…',
    backupPulling: 'در حال دریافت…',
    backupError: 'پشتیبان‌گیری در انتظار اینترنت',
    backupNow: 'پشتیبان‌گیری الان',
    backupNever: 'هنوز پشتیبان‌گیری نشده',
    backupLast: (when: string) => `آخرین پشتیبان‌گیری: ${when}`,
    backupAnonymous: 'پیشرفت فقط روی همین دستگاه ذخیره شده است.',
    backupSaveProgress: 'ذخیرهٔ پیشرفت با شمارهٔ موبایل',
    backupRelogin: 'برای ادامهٔ پشتیبان‌گیری دوباره وارد شوید',
    downloadTitle: 'دانلود واژه‌ها',
    downloadNone: 'نیازی به دانلود نیست',
    downloadChecking: 'در حال بررسی…',
    downloadProgress: (percent: string) => `دانلود واژه‌ها ${percent} — با اینترنت ادامه پیدا می‌کند`,
    downloadVerifying: 'در حال بررسی صحت…',
    downloadInstalled: 'نصب‌شده',
    downloadError: 'دانلود در انتظار اینترنت',
    installTitle: 'نصب برنامه',
    installInstalledLabel: 'نصب‌شده',
    reportTitle: 'گزارش مشکل',
    reportNotePlaceholder: 'توضیح مشکل (اختیاری)',
    reportSubmit: 'ارسال گزارش',
    reportSent: 'گزارش شما ثبت شد',
    aboutTitle: 'دربارهٔ برنامه',
    supportLink: 'پشتیبانی',
  },

  season: {
    title: 'جمع‌بندی فصل',
    intro: 'کنکور این دوره رسید — این خلاصهٔ مسیر شماست.',
    conquered: 'کلمهٔ فتح‌شده',
    daysStudied: 'روز مطالعه',
    presentations: 'ارائه',
    newDate: 'تاریخ جدید',
  },

  /** The install sheet (`what.md` §7.8's install paragraph), opened from settings. */
  install: {
    sheetTitle: 'نصب برنامه',
    installAction: 'نصب',
    inAppBrowserBody: 'برای نصب، این صفحه را در Chrome باز کنید.',
    copyLink: 'کپی لینک',
    copied: 'کپی شد',
    iosBody:
      'برای نصب: دکمهٔ اشتراک‌گذاری (Share) را بزنید، سپس «Add to Home Screen» را انتخاب کنید.',
    installedBody: 'برنامه نصب شده است.',
    unavailableBody: 'نصب مستقیم در این مرورگر ممکن نیست؛ برای نصب از Chrome استفاده کنید.',
  },

  /** `/onboarding` (what.md §7.8 row 1, §5.5–5.6). Appended as one block by ticket dev-web/02. */
  onboarding: {
    slide1Title: 'کنکور لایتنر',
    slide1Body: 'واژه‌هایی را مرور کنید که واقعاً در آزمون‌های ارشد و دکتری کنکور آمده‌اند.',
    slide2Title: 'بر اساس فرکانس کنکور',
    slide2Body:
      'هر واژه بر اساس تعداد دفعاتی که در کنکورهای واقعی سال‌های اخیر آمده، اولویت‌بندی می‌شود.',
    slide3Title: 'جعبه‌های لایتنر',
    slide3Body:
      'هر واژه در یکی از پنج جعبه جا می‌گیرد؛ اگر بلد باشید یک جعبه جلو می‌رود، اگر نه به جعبهٔ اول برمی‌گردد.',
    haveAccount: 'قبلاً حساب داشتم',
    next: 'بعدی',
    back: 'بازگشت',
    skip: 'رد کردن',
    minutesTitle: 'چقدر وقت برای مطالعه دارید؟',
    minutesCaption: 'در هر روز',
    examDateTitle: 'تاریخ کنکور شما کی است؟',
    examDateYear: 'سال',
    examDateMonth: 'ماه',
    examDateDay: 'روز',
    examDateYearLabel: 'سال کنکور',
    examDateMonthLabel: 'ماه کنکور',
    examDateDayLabel: 'روز کنکور',
    fieldTitle: 'رشتهٔ تحصیلی شما چیست؟',
    fieldNone: 'انتخاب نشده',
    placementTitle: 'کدام واژه‌ها را بلدید؟',
    placementBody: 'این مرحله اختیاری است و به شخصی‌سازی مسیر یادگیری شما کمک می‌کند.',
    placementCounter: (n: string, total: string) => `${n} از ${total}`,
    placementKnow: 'بلدم',
    placementDontKnow: 'بلد نیستم',
    placementDone: 'همهٔ واژه‌ها بررسی شد.',
    installTitle: 'برنامه را نصب کنید',
    installBody: 'با نصب برنامه، کنکور لایتنر حتی بدون اینترنت هم در دسترس شماست.',
    installContinue: 'ادامه',
    installNow: 'نصب برنامه',
  },

  /** `/login` (what.md §7.8). The screen needs the internet; everything else does not. */
  login: {
    why: 'با شمارهٔ موبایل وارد شوید تا پیشرفت شما پشتیبان‌گیری شود، روی گوشی تازه برگردد و بتوانید نسخهٔ کامل را بخرید.',
    phoneLabel: 'شمارهٔ موبایل',
    phonePlaceholder: '۰۹۱۲۱۲۳۴۵۶۷',
    send: 'ارسال کد',
    sending: 'در حال ارسال…',
    phoneInvalid: 'این شماره یک موبایل ایرانی معتبر نیست.',
    failed: 'مشکلی پیش آمد. کمی بعد دوباره تلاش کنید.',
    /** Followed by the number itself, isolated left-to-right in the markup. */
    codeSentTo: 'کد ورود پیامک شد به',
    codeLabel: 'کد ورود',
    verify: 'ورود',
    verifying: 'در حال بررسی…',
    wrongCode: (left: string) => `کد اشتباه است. ${left} تلاش دیگر باقی مانده.`,
    codeExpired: 'این کد منقضی شده است. یک کد تازه بگیرید.',
    codeLocked: 'تعداد تلاش‌ها تمام شد. یک کد تازه بگیرید.',
    resend: 'ارسال دوبارهٔ کد',
    changePhone: 'تغییر شماره',
    rateLimited: (minutes: string) =>
      `درخواست‌ها بیش از حد مجاز شد. ${minutes} دقیقهٔ دیگر دوباره تلاش کنید.`,
    network:
      'اتصال به اینترنت برقرار نیست. ورود به اینترنت نیاز دارد؛ مرور واژه‌ها بدون اینترنت هم کار می‌کند.',
    retry: 'تلاش دوباره',
    done: 'وارد شدید.',
  },

  /** Joiners that are copy in all but name: they only exist because the text is Persian. */
  format: {
    /** Between the items of a Persian list: «مرفه، ثروتمند». */
    listSeparator: '، ',
  },

  /** `ui/relative-time.ts`. The number arrives already in Persian digits. */
  relativeTime: {
    now: 'الان',
    minutesAhead: (n: string) => `${n} دقیقه دیگر`,
    hoursAhead: (n: string) => `${n} ساعت دیگر`,
    daysAhead: (n: string) => `${n} روز دیگر`,
    minutesAgo: (n: string) => `${n} دقیقه پیش`,
    hoursAgo: (n: string) => `${n} ساعت پیش`,
    daysAgo: (n: string) => `${n} روز پیش`,
  },

  notFound: {
    body: 'این نشانی در برنامه وجود ندارد.',
    home: 'بازگشت به خانه',
  },
} as const;

export type Strings = typeof strings;
