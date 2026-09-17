# ورق کالیبراسیون — دادهٔ ۲۵ واژه

**تاریخ:** ۱۷ شهریور ۱۴۰۵ (2026-09-17) · **شاخه:** `feat/stem-vocab-selection`

این ۲۵ واژه از ۲٬۰۹۸ واژه نوشته شده‌اند و **در فایل‌های `content/lexicon/` هم اعمال شده‌اند**،
تا خروجی واقعی را ببینید نه نمونهٔ روی کاغذ. هیچ واژهٔ دیگری دست نخورده است.

۲۵ واژه طوری انتخاب شده‌اند که **اختلاف‌نظر را بیرون بکشند**، نه اینکه خوب به نظر برسند:
صدر صف، میانهٔ صف، چندمعنایی‌ها، واژه‌های اشتباه‌انداز، واژه‌های بافتی و اصطلاح تخصصی.

**نحوهٔ بازخورد:** زیر هر واژه یک خط `**شما:**` هست. هر جا مخالفید همان‌جا بنویسید.
مهم‌تر از تک‌تک واژه‌ها، **۹ سؤال باز** پایین همین بخش است — جواب آن‌ها تعیین می‌کند
۲٬۰۷۳ واژهٔ باقی‌مانده چطور نوشته شوند.

---

## سؤال‌های باز — این‌ها را اول جواب بدهید

### پ۱. برای هر واژه چند معنی بنویسیم؟
قاعده‌ای که فعلاً به کار بستم: **اول معنایی که آزمون سنجیده، بعد حداکثر یکی دو معنی
پرکاربردِ دیگر که داوطلب واقعاً لازم دارد.** نتیجه‌اش را در `run` ببینید: ۴ معنی نوشتم
که فقط ۲ تا از آن‌ها در آزمون آمده‌اند.

سه گزینه: **(الف)** فقط معناهای سنجیده‌شده — ارزان‌تر و متمرکزتر، اما کارت `run` فقط
«خطر کردن» را یاد می‌دهد و «دویدن» را نه. **(ب)** همین کاری که کردم. **(ج)** مدخل کامل
دیکشنری‌وار — گران و برای فلش‌کارت زیادی.

**شما:** ________________

### پ۲. `level` سطحِ واژه است یا سطحِ معنی؟
طبق ADR-0012 سطحِ *واژه* است، پس برای `run` نوشتم `A1`. ولی معنایی که آزمون سنجیده
(`run the risk of`) در عمل `C1` است. اگر بعداً نسخهٔ سطح‌بندی‌شده بسازیم، `run` با
برچسب `A1` سرِ کلاس مبتدی می‌رود در حالی که محتوایش مبتدی نیست.

گزینه: همین‌طور بماند، یا `level` را به سطحِ **معنای اولِ** هر واژه بدهیم،
یا هر `sense` سطح خودش را داشته باشد (گران‌تر ولی دقیق).

**شما:** ________________

### پ۳. `testedIn` برای گزینه‌های انحرافی هم پر شود؟
بند ۱۳ چک‌لیست lint می‌گوید هر موردِ `tested` باید به یک معنی نسبت داده شود — یعنی
حتی وقتی واژه **گزینهٔ غلط** بوده. برای `withdraw` این یعنی باید حدس می‌زدم داوطلب
آن گزینهٔ غلط را در کدام معنی می‌خواند، و گاهی این حدس واقعاً قابل بحث است.

گزینه: **(الف)** همین‌طور بماند. **(ب)** `testedIn` فقط مواردی را بگیرد که واژه
**کلید** بوده، و بند ۱۳ نرم شود. گزینهٔ (ب) داده را مطمئن‌تر ولی کم‌رنگ‌تر می‌کند.

**شما:** ________________

### پ۴. معنایی که فقط در یک ترکیب زنده است
`vicious` را دو معنی کردم و **اول** گذاشتم: `vicious circle` (دور باطل)، بعد
«بی‌رحم». چون سؤال ۱۴۰۴ دقیقاً روی همین ترکیب است — `cruel`، `fierce` و `severe`
همه معنی «بی‌رحم» می‌دهند ولی با `circle` نمی‌نشینند.

درست است که ترکیب را یک معنیِ مستقل حساب کنیم، یا باید ذیل معنی اصلی به عنوان
یادداشت می‌آمد؟

**شما:** ________________

### پ۵. لحن و طول مثال‌ها
مثال‌ها ۸ تا ۱۴ کلمه‌اند، جملهٔ کامل، و **هیچ‌کدام جملهٔ آزمون نیستند** (آن جدا و در
زمان ساخت به کارت وصل می‌شود). ترجمهٔ فارسی را **روان** نوشتم نه لفظ‌به‌لفظ.

کوتاه‌تر بهتر است؟ ترجمه‌ها زیادی آزادند یا درست‌اند؟

**شما:** ________________

### پ۶. چند ترجمهٔ فارسی برای هر معنی؟
۱ تا ۳ تا نوشتم، رایج‌ترین اول. `translations` همان چیزی است که اپ نشان می‌دهد،
پس تعدادش مستقیماً روی شلوغیِ کارت اثر دارد.

**شما:** ________________

### پ۷. `definition` انگلیسی — لحن و طول
لحنِ دیکشنریِ زبان‌آموز، نه مترادف‌نویسی. مثلاً برای `impede`:
«to slow something down or make it more difficult to move or happen».

**شما:** ________________

### پ۸. یادداشت‌ها به چه زبانی؟
`confusables[].note` را **فارسی** نوشتم چون به کاربر نشان داده می‌شود.
`homograph.note` را **انگلیسی** نوشتم چون یادداشتی برای شماست و به کاربر نمی‌رسد.

**شما:** ________________

### پ۹. سه واژه پرچمِ `homograph` خورده‌اند — تصمیمش با شماست
`content`، `bear` و `bolt`. هر سه `homograph.suspected: true` دارند و یادداشتِ
پیشنهادِ تقسیم. **من هیچ فایلی را تغییر نام ندادم** (قانون ۶ قانون اساسی).
طبق چک‌لیست lint، تقسیم باید **قبل از اینکه کاربری روی آن شناسه پیشرفت داشته باشد**
انجام شود — یعنی حالا، نه بعد از انتشار.

**شما:** ________________

---

## ۱. صدر صف — پنج واژهٔ پرتکرارترِ آزمون

این‌ها اول از همه ساخته می‌شوند و بیشترین دیده‌شدن را در اپ دارند.

### perilous   ·   `C1`

`سنجیده‌شده=10× · کلید=7× · بافتی=0× · اولویت=32`

**جملهٔ آزمون (عیناً):**

> You should avoid driving during the snowstorm because the icy roads are ..... .
>
> `arshad-1400-p01 q10 · کلید · پاسخ درست: perilous`

> Since the journey is ....., be sure to bring a first-aid kit.
>
> `arshad-1400-p03 q3 · کلید · پاسخ درست: perilous`

*(و 3 جملهٔ متفاوت دیگر)*

**آنچه نوشته شد:**

1. **پرخطر / خطرناک / مخاطره‌آمیز**  `adj` `/ˈperələs/` · 10 مورد از آزمون
   - *very dangerous, especially because someone could be badly hurt or killed*
   - مترادف: hazardous, treacherous, precarious · متضاد: safe, secure
   - «The mountain path becomes perilous after heavy rain.»
     مسیر کوهستانی بعد از باران شدید پرخطر می‌شود.

**اشتباه‌انداز:** هیچ — عمداً خالی گذاشته شد.

**شما:** ________________

### derive   ·   `B2`

`سنجیده‌شده=9× · کلید=2× · بافتی=0× · اولویت=23`

**جملهٔ آزمون (عیناً):**

> Immigration ..... from the Latin word migration and means the act of a foreigner entering a
> country in the aim of obtaining the right of permanent residence.
>
> `arshad-1402-p03 q2 · کلید · پاسخ درست: derives`

> The islands ..... their name from the sacred images found on them by the early European
> navigators.
>
> `arshad-1401-p02 q2 · کلید · پاسخ درست: derive`

*(و 4 جملهٔ متفاوت دیگر)*

**آنچه نوشته شد:**

1. **به دست آوردن از / گرفتن از / کسب کردن**  `v` `/dɪˈraɪv/` · 5 مورد از آزمون
   - *to get or obtain something from a particular source*
   - مترادف: obtain, gain, draw · متضاد: —
   - «Chemists derive many useful drugs from ordinary plants.»
     شیمی‌دان‌ها بسیاری از داروهای مفید را از گیاهان معمولی به دست می‌آورند.
2. **ریشه گرفتن از / برگرفته شدن از / نشئت گرفتن**  `v` `/dɪˈraɪv/` · 4 مورد از آزمون
   - *to have something as its origin; to come from something*
   - مترادف: originate, stem, spring · متضاد: —
   - «The English word "salary" derives from the Latin word for salt.»
     واژهٔ انگلیسی «salary» از واژهٔ لاتین به معنای نمک ریشه گرفته است.

**اشتباه‌انداز:**
- `deprive` — شباهت ظاهری؛ deprive یعنی محروم کردن و هم‌ریشهٔ derive نیست

**شما:** ________________

### affluent   ·   `C1`

`سنجیده‌شده=6× · کلید=5× · بافتی=0× · اولویت=22`

**جملهٔ آزمون (عیناً):**

> Nationwide, poor children and adolescents are participating far less in sports and fitness
> activities than their more ..... peers.
>
> `arshad-1404-p01 q6 · کلید · پاسخ درست: affluent`

> The writer's stories appeal to a wide range of people—young and old, ..... and poor,
> literary and nonliterary.
>
> `arshad-1400-p03 q4 · کلید · پاسخ درست: affluent`

*(و 1 جملهٔ متفاوت دیگر)*

**آنچه نوشته شد:**

1. **مرفه / ثروتمند / متمکن**  `adj` `/ˈæfluənt/` · 6 مورد از آزمون
   - *having plenty of money and a comfortable standard of living*
   - مترادف: wealthy, prosperous, well-off · متضاد: impecunious, destitute, needy
   - «They grew up in an affluent neighbourhood where every family owned two cars.»
     آن‌ها در محله‌ای مرفه بزرگ شدند که هر خانواده در آن دو خودرو داشت.

**اشتباه‌انداز:**
- `effluent` — تلفظ و املای بسیار نزدیک، اما effluent یعنی پساب و فاضلاب

**شما:** ________________

### apprehensive   ·   `C1`

`سنجیده‌شده=6× · کلید=5× · بافتی=0× · اولویت=22`

**جملهٔ آزمون (عیناً):**

> I was in need of money and not at all ..... about experiments, so I concurred and received
> the new medicine at the local hospital.
>
> `arshad-1405-p03 q6 · کلید · پاسخ درست: apprehensive`

> Although Mr. Jackson was ....., he attempted to be jovial so that his colleagues at the
> meeting wouldn't think there was a problem.
>
> `arshad-1400-p03 q7 · کلید · پاسخ درست: apprehensive`

*(و 1 جملهٔ متفاوت دیگر)*

**آنچه نوشته شد:**

1. **دلواپس / نگران / بیمناک**  `adj` `/ˌæprɪˈhensɪv/` · 6 مورد از آزمون
   - *worried or nervous that something unpleasant is going to happen*
   - مترادف: anxious, uneasy, fearful · متضاد: confident, unconcerned
   - «She felt apprehensive about her first day at the new school.»
     او دربارهٔ نخستین روزش در مدرسهٔ جدید دلواپس بود.

**اشتباه‌انداز:**
- `comprehensive` — شباهت ظاهری؛ comprehensive یعنی جامع و فراگیر، نه نگران
- `apprehend` — هم‌ریشه است اما فعل و به معنای دستگیر کردن یا درک کردن

**شما:** ________________

### withdraw   ·   `B2`

`سنجیده‌شده=11× · کلید=1× · بافتی=0× · اولویت=21`

**جملهٔ آزمون (عیناً):**

> They were forced to ---------- the accusation and issue a full apology live on air.
>
> `arshad-1400-p11 q35 · کلید · پاسخ درست: withdraw`

> The celebrity will ..... assistance from the police to keep stalkers away from his property.
>
> `arshad-1402-p01 q6 · گزینهٔ انحرافی · پاسخ درست: invoke`

*(و 5 جملهٔ متفاوت دیگر)*

**آنچه نوشته شد:**

1. **پس گرفتن / پس کشیدن (حرف یا حمایت)**  `v` `/wɪðˈdrɔː/` · 2 مورد از آزمون
   - *to say officially that something you said or offered is no longer true or available*
   - مترادف: retract, revoke, rescind · متضاد: affirm, uphold
   - «The newspaper withdrew the claim once the evidence had been checked.»
     روزنامه پس از بررسی مدارک، آن ادعا را پس گرفت.
2. **برداشت کردن / بیرون کشیدن / خارج کردن**  `v` `/wɪðˈdrɔː/` · 3 مورد از آزمون
   - *to take money out of a bank account, or to remove something from a place*
   - مترادف: extract, remove · متضاد: deposit
   - «He withdrew a small amount from his savings account.»
     او مبلغ کمی از حساب پس‌اندازش برداشت کرد.
3. **عقب کشیدن / کناره‌گیری کردن / انصراف دادن**  `v` `/wɪðˈdrɔː/` · 6 مورد از آزمون
   - *to move back or away from a place or situation, or to stop taking part in something*
   - مترادف: retreat, pull out, back off · متضاد: advance, engage
   - «Two runners withdrew from the race after the first lap.»
     دو دونده پس از دور اول از مسابقه کناره‌گیری کردند.

**اشتباه‌انداز:**
- `withhold` — withdraw یعنی چیزی را که داده‌ای پس بگیری؛ withhold یعنی از همان اول ندهی

**شما:** ________________

---

## ۲. میانهٔ صف — پنج واژه با یک‌بار تکرار

نمونهٔ بدنهٔ اصلی کار: هر کدام فقط یک بار در ده سال آزمون آمده‌اند.

### impede   ·   `C1`

`سنجیده‌شده=1× · کلید=1× · بافتی=0× · اولویت=5`

**جملهٔ آزمون (عیناً):**

> It is said that "the El" did not meet the historic criteria for being registered, as it
> ..... the view from the street of other historic buildings and because the structure
> generally downgraded the quality of life in the city.
>
> `arshad-1404-p01 q7 · کلید · پاسخ درست: impeded`

**آنچه نوشته شد:**

1. **مانع شدن / سد راه شدن / کند کردن**  `v` `/ɪmˈpiːd/` · 1 مورد از آزمون
   - *to slow something down or make it more difficult to move or happen*
   - مترادف: hinder, obstruct, hamper · متضاد: facilitate, expedite
   - «Thick fog impeded the rescue team's progress up the mountain.»
     مه غلیظ مانع پیشروی تیم نجات به سمت بالای کوه شد.

**اشتباه‌انداز:**
- `impel` — شباهت ظاهری اما تقریباً معنای عکس؛ impel یعنی وادار کردن و به حرکت واداشتن

**شما:** ________________

### vicious   ·   `B2`

`سنجیده‌شده=1× · کلید=1× · بافتی=0× · اولویت=5`

**جملهٔ آزمون (عیناً):**

> The situation turned into a .................... circle: the more he struggled, the more he
> was criticized; the more he was criticized, the more he struggled.
>
> `arshad-1404-p05 q14 · کلید · پاسخ درست: vicious`

**آنچه نوشته شد:**

1. **باطل (در ترکیب vicious circle: دور باطل) / معیوب**  `adj` `/ˈvɪʃəs/` · 1 مورد از آزمون
   - *used in *vicious circle* or *vicious cycle*, to describe a situation in which each problem causes another and makes the whole thing worse*
   - مترادف: — · متضاد: virtuous
   - «Debt and low pay form a vicious circle that is hard to escape.»
     بدهی و دستمزد پایین دور باطلی می‌سازند که گریز از آن دشوار است.
2. **بی‌رحم / درنده‌خو / وحشیانه**  `adj` `/ˈvɪʃəs/` · سنجیده نشده
   - *cruel and violent, or intended to hurt someone*
   - مترادف: brutal, savage, ferocious · متضاد: gentle, kindly
   - «The dog had a vicious temper and could not be left with children.»
     آن سگ خویی درنده داشت و نمی‌شد او را کنار بچه‌ها گذاشت.

**اشتباه‌انداز:**
- `viscous` — املا و تلفظ بسیار نزدیک، اما viscous یعنی غلیظ و چسبناک

**شما:** ________________

### bulwark   ·   `C2`

`سنجیده‌شده=1× · کلید=0× · بافتی=0× · اولویت=3`

**جملهٔ آزمون (عیناً):**

> The phrase "sibling rivalry" is hardly adequate to describe the ..... between J R and Colin,
> whose interaction consists of almost nonstop sniping, undermining and other forms of verbal
> abuse.
>
> `arshad-1399-p08 q26 · گزینهٔ انحرافی · پاسخ درست: animus`

**آنچه نوشته شد:**

1. **سنگر / دژ دفاعی / سپر محافظ**  `n` `/ˈbʊlwək/` · 1 مورد از آزمون
   - *something or someone that protects or defends against danger or attack*
   - مترادف: rampart, safeguard, defence · متضاد: —
   - «An independent press is a bulwark against the abuse of power.»
     مطبوعات مستقل سنگری در برابر سوءاستفاده از قدرت‌اند.

**اشتباه‌انداز:** هیچ — عمداً خالی گذاشته شد.

**شما:** ________________

### dwell   ·   `C1`

`سنجیده‌شده=1× · کلید=0× · بافتی=0× · اولویت=3`

**جملهٔ آزمون (عیناً):**

> ..... uncertainty requires a shift in mindset that acknowledges that life is ever-changing,
> and that certainty is an illusion.
>
> `arshad-1405-p05 q10 · گزینهٔ انحرافی · پاسخ درست: Embracing`

**آنچه نوشته شد:**

1. **مدام به چیزی فکر کردن / روی چیزی ماندن / کِش دادن موضوع**  `v` `/dwel/` · 1 مورد از آزمون
   - *to keep thinking or talking about something, especially something unpleasant (usually *dwell on*)*
   - مترادف: brood, linger on · متضاد: dismiss, move on
   - «Try not to dwell on mistakes you can no longer fix.»
     سعی کن مدام به اشتباه‌هایی که دیگر نمی‌توانی جبرانشان کنی فکر نکنی.
2. **سکونت داشتن / زیستن / ساکن بودن**  `v` `/dwel/` · سنجیده نشده
   - *to live in a particular place (formal or literary)*
   - مترادف: reside, inhabit · متضاد: —
   - «Few people still dwell in the old part of the village.»
     افراد کمی هنوز در بخش قدیمی روستا سکونت دارند.

**اشتباه‌انداز:**
- `dwindle` — شباهت ظاهری؛ dwindle یعنی کم‌کم کاهش یافتن و آب رفتن

**شما:** ________________

### propitious   ·   `C2`

`سنجیده‌شده=1× · کلید=0× · بافتی=0× · اولویت=3`

**جملهٔ آزمون (عیناً):**

> Brad's thesis is that attempts to ground moral status on a single criterion have been
> unsuccessful, as they inevitably lead to ..... measures to fit diverse values into a single
> mold.
>
> `arshad-1403-p04 q21 · گزینهٔ انحرافی · پاسخ درست: procrustean`

**آنچه نوشته شد:**

1. **مساعد / مناسب / خوش‌یُمن**  `adj` `/prəˈpɪʃəs/` · 1 مورد از آزمون
   - *likely to produce a good result; favourable for a particular activity*
   - مترادف: auspicious, favourable, opportune · متضاد: inauspicious, unfavourable
   - «The calm sea and clear sky were propitious for the launch.»
     دریای آرام و آسمان صاف برای پرتاب مساعد بود.

**اشتباه‌انداز:**
- `precipitous` — شباهت ظاهری؛ precipitous یعنی بسیار پرشیب یا شتاب‌زده

**شما:** ________________

---

## ۳. چندمعنایی — جایی که `senses[]` باید بیش از یک معنی داشته باشد

آزمون فقط یکی از معناها را سنجیده. سؤال این است که چند معنی بنویسیم.

### content   ·   `B1`

`سنجیده‌شده=2× · کلید=1× · بافتی=0× · اولویت=8`

**جملهٔ آزمون (عیناً):**

> Advertisements for breakfast cereals have, for many years, been found to be especially fond
> of fantasy techniques, with almost nine out of ten including such ..... .
>
> `arshad-1402-p06 q24 · کلید · پاسخ درست: content`

> My father has always been ..... with his money. I didn't have to pay for college or even for
> the confused year I spent at Princeton taking graduate courses in sociology.
>
> `arshad-1404-p01 q3 · گزینهٔ انحرافی · پاسخ درست: generous`

**آنچه نوشته شد:**

1. **محتوا / مضمون / مطالب**  `n` `/ˈkɒntent/` · 1 مورد از آزمون
   - *the subject matter or material contained in a book, programme, speech or website*
   - مترادف: substance, material · متضاد: form
   - «The book's content is excellent, but the title is misleading.»
     محتوای کتاب عالی است، اما عنوانش گمراه‌کننده است.
2. **راضی / خرسند / قانع**  `adj` `/kənˈtent/` · 1 مورد از آزمون
   - *happy and satisfied with what you have, without wanting more*
   - مترادف: satisfied, at ease · متضاد: discontented, dissatisfied
   - «She is content with a small house and a quiet life.»
     او به خانه‌ای کوچک و زندگی‌ای آرام راضی است.

**اشتباه‌انداز:**
- `contentment` — اسمِ حالتِ رضایت است، نه محتوا؛ content به معنای محتوا اسمی جداگانه است

**⚠ پرچم homograph:** Different stress and different part of speech: the noun /ˈkɒntent/ (subject matter) and the adjective /kənˈtent/ (satisfied). Unrelated for a learner. Candidate split: content-1 (n, محتوا) / content-2 (adj, راضی).

**شما:** ________________

### run   ·   `A1`

`سنجیده‌شده=2× · کلید=2× · بافتی=0× · اولویت=10`

**جملهٔ آزمون (عیناً):**

> If exploitation of the planet's resources continues as at present, then the lifestyle we
> currently enjoy ..... the risk of causing significant damage to the world.
>
> `arshad-1401-p01 q10 · کلید · پاسخ درست: runs`

> By 1979, the total borrowings and losses of state-owned industries were ..... at about £3
> billion a year.
>
> `arshad-1398-p07 q177 · کلید · پاسخ درست: running`

**آنچه نوشته شد:**

1. **در معرض خطر بودن / خطر کردن / ریسک کردن**  `v` `/rʌn/` · 1 مورد از آزمون
   - *to be in a situation where something bad could happen to you (in *run a risk* or *run the risk of*)*
   - مترادف: risk, incur · متضاد: —
   - «If you skip the backup, you run the risk of losing everything.»
     اگر از پشتیبان‌گیری صرف‌نظر کنی، خطر از دست دادن همه چیز را به جان می‌خری.
2. **بالغ بودن بر / در سطحِ ... بودن / رسیدن به (میزان)**  `v` `/rʌn/` · 1 مورد از آزمون
   - *to be at a particular level, rate or amount*
   - مترادف: stand at, amount to · متضاد: —
   - «Inflation was running at nearly forty percent that year.»
     تورم در آن سال نزدیک به چهل درصد بود.
3. **دویدن**  `v` `/rʌn/` · سنجیده نشده
   - *to move quickly on foot, faster than walking*
   - مترادف: sprint, dash · متضاد: walk
   - «He runs five kilometres every morning before work.»
     او هر روز صبح پیش از کار پنج کیلومتر می‌دود.
4. **اداره کردن / گرداندن**  `v` `/rʌn/` · سنجیده نشده
   - *to manage or be in charge of a business or organization*
   - مترادف: manage, operate · متضاد: —
   - «Her sister runs a small bakery near the station.»
     خواهرش نانوایی کوچکی نزدیک ایستگاه اداره می‌کند.

**اشتباه‌انداز:** هیچ — عمداً خالی گذاشته شد.

**شما:** ________________

### address   ·   `B2`

`سنجیده‌شده=2× · کلید=1× · بافتی=0× · اولویت=8`

**جملهٔ آزمون (عیناً):**

> When you ..... a meeting, it is important to speak clearly, confidently and at a good pace.
>
> `arshad-1402-p01 q1 · کلید · پاسخ درست: address`

> It is hardly surprising that most explorations of the future of cities and approaches to
> developing urban strategies ..... to incorporate questions related to the governance of
> cities.
>
> `arshad-1404-p06 q21 · گزینهٔ انحرافی · پاسخ درست: tend`

**آنچه نوشته شد:**

1. **سخنرانی کردن برای / خطاب قرار دادن**  `v` `/əˈdres/` · 1 مورد از آزمون
   - *to give a formal speech to a group of people*
   - مترادف: speak to · متضاد: —
   - «The minister will address the conference on Monday morning.»
     وزیر صبح دوشنبه در همایش سخنرانی خواهد کرد.
2. **پرداختن به / رسیدگی کردن به / مورد توجه قرار دادن**  `v` `/əˈdres/` · 1 مورد از آزمون
   - *to deal with a problem or question, or to give attention to it*
   - مترادف: tackle, deal with · متضاد: ignore, neglect
   - «The report fails to address the cost of the plan.»
     گزارش به هزینهٔ این طرح نمی‌پردازد.
3. **نشانی / آدرس**  `n` `/əˈdres/` · سنجیده نشده
   - *the details of the place where someone lives or where mail is delivered*
   - مترادف: — · متضاد: —
   - «Please write your full address on the back of the form.»
     لطفاً نشانی کامل خود را پشت فرم بنویسید.

**اشتباه‌انداز:** هیچ — عمداً خالی گذاشته شد.

**شما:** ________________

### bear   ·   `B1`

`سنجیده‌شده=1× · کلید=0× · بافتی=0× · اولویت=3`

**جملهٔ آزمون (عیناً):**

> The programmer ..... an analogy between the human brain and the computer.
>
> `arshad-1398-p02 q5 · گزینهٔ انحرافی · پاسخ درست: drew`

**آنچه نوشته شد:**

1. **داشتن (شباهت یا نشانه) / حمل کردن (نشان)**  `v` `/beə(r)/` · 1 مورد از آزمون
   - *to have or show a particular quality or relation, as in *bear a resemblance to* something*
   - مترادف: carry, have · متضاد: —
   - «The copy bears no resemblance to the original painting.»
     آن نسخه هیچ شباهتی به نقاشی اصلی ندارد.
2. **تحمل کردن / برتافتن / طاقت آوردن**  `v` `/beə(r)/` · سنجیده نشده
   - *to accept or endure something unpleasant without complaining*
   - مترادف: endure, tolerate, stand · متضاد: —
   - «He could not bear the noise from the street any longer.»
     او دیگر نمی‌توانست سروصدای خیابان را تحمل کند.
3. **خرس**  `n` `/beə(r)/` · سنجیده نشده
   - *a large heavy wild animal with thick fur and sharp claws*
   - مترادف: — · متضاد: —
   - «A brown bear was seen near the campsite at dawn.»
     سپیده‌دم خرسی قهوه‌ای نزدیک اردوگاه دیده شد.

**اشتباه‌انداز:**
- `bare` — هم‌آوا با bear؛ اما bare یعنی برهنه، خالی و بدون پوشش

**⚠ پرچم homograph:** CLAUDE.md names this case explicitly: the verb (endure / have as a feature) and the noun (the animal) are unrelated for a learner. Candidate split: bear-1 (v, تحمل کردن) / bear-2 (n, خرس).

**شما:** ________________

### bolt   ·   `B2`

`سنجیده‌شده=1× · کلید=0× · بافتی=0× · اولویت=3`

**جملهٔ آزمون (عیناً):**

> Everyone seemed to have a specific role except me. I felt like a fifth ..... .
>
> `arshad-1399-p08 q16 · گزینهٔ انحرافی · پاسخ درست: wheel`

**آنچه نوشته شد:**

1. **پیچ (با مهره) / کلون / چفت**  `n` `/bəʊlt/` · 1 مورد از آزمون
   - *a thick metal pin used with a nut to fasten things together, or a bar that slides across to lock a door*
   - مترادف: pin, latch · متضاد: —
   - «The gate is held shut by a heavy iron bolt.»
     دروازه با کلونی سنگین و آهنی بسته نگه داشته می‌شود.
2. **آذرخش / صاعقه**  `n` `/bəʊlt/` · سنجیده نشده
   - *a sudden flash of lightning that strikes the ground*
   - مترادف: thunderbolt · متضاد: —
   - «A bolt of lightning split the old oak in half.»
     آذرخشی بلوط کهنسال را از وسط شکافت.
3. **رم کردن / در رفتن / ناگهان گریختن**  `v` `/bəʊlt/` · سنجیده نشده
   - *to run away suddenly and very fast, especially because of fear*
   - مترادف: dash, flee · متضاد: —
   - «The horse bolted as soon as it heard the gunshot.»
     اسب به‌محض شنیدن صدای شلیک رم کرد و در رفت.

**اشتباه‌انداز:** هیچ — عمداً خالی گذاشته شد.

**⚠ پرچم homograph:** The fastener, the lightning flash and the verb "to dash away" are far apart for a learner even though they share a root. Candidate split: bolt-1 (n, پیچ/کلون) / bolt-2 (v, رم کردن). Owner's call.

**شما:** ________________

---

## ۴. واژه‌هایی با اشتباه‌انداز — `confusables`

گزینه‌های انحرافی کنکور دقیقاً از همین‌جا ساخته می‌شوند.

### conscience   ·   `B2`

`سنجیده‌شده=0× · کلید=0× · بافتی=2× · اولویت=0`

**جملهٔ آزمون (عیناً):**

> When it is a straight choice between survival and an environmental conscience, the former
> wins out every time, and instinct as well as their sense of responsibility to their families
> will compel farmers and community leaders to hunt and kill dangerous predators ..... around
> their villages in the night, and herds of elephants capable of stampeding their way through
> .....
>
> `arshad-1400-p09 q35 · در متن سؤال · پاسخ درست: prowling`

> When it is a straight choice between survival and an environmental conscience, the former
> wins out every time, and instinct as well as their sense of responsibility to their families
> will compel farmers and community leaders to hunt and kill dangerous predators prowling
> around their villages in the night, and herds of elephants capable of stampeding their way
> through .....
>
> `arshad-1400-p09 q36 · در متن سؤال · پاسخ درست: flattening whole towns`

**آنچه نوشته شد:**

1. **وجدان / وجدان اخلاقی**  `n` `/ˈkɒnʃəns/` · سنجیده نشده
   - *the sense inside you that tells you whether what you are doing is right or wrong*
   - مترادف: scruples, moral sense · متضاد: —
   - «He could not silence his conscience after keeping the money.»
     پس از برداشتن آن پول نتوانست وجدانش را ساکت کند.

**اشتباه‌انداز:**
- `conscious` — صفت است و یعنی هوشیار یا آگاه؛ conscience اسم است و یعنی وجدان
- `conscientious` — صفت و یعنی وظیفه‌شناس و باوجدان در کار

**شما:** ________________

### contentment   ·   `B2`

`سنجیده‌شده=0× · کلید=0× · بافتی=1× · اولویت=0`

**جملهٔ آزمون (عیناً):**

> Despite the fact that Gross Domestic Product (GDP) has increased substantially in the
> industrialized West, the levels of human contentment have remained ..... .
>
> `arshad-1402-p03 q1 · در متن سؤال · پاسخ درست: static`

**آنچه نوشته شد:**

1. **خرسندی / رضایت / قناعت**  `n` `/kənˈtentmənt/` · سنجیده نشده
   - *a state of quiet happiness and satisfaction with what you have*
   - مترادف: satisfaction, ease · متضاد: discontent, dissatisfaction
   - «After years of striving, she found contentment in a quiet life.»
     پس از سال‌ها تلاش، خرسندی را در زندگی‌ای آرام یافت.

**اشتباه‌انداز:**
- `content` — content اسم که باشد یعنی محتوا؛ حالتِ رضایت را باید با contentment گفت

**شما:** ________________

### adjacent   ·   `B2`

`سنجیده‌شده=0× · کلید=0× · بافتی=1× · اولویت=0`

**جملهٔ آزمون (عیناً):**

> In early period of human history, when voyages and travels were not undertaken from the view
> of amusement or instruction, or from political or commercial motives, the discovery of
> adjacent countries was chiefly affected by war, and of distant regions by commerce.
>
> `arshad-1399-p10 q14 · در متن سؤال · پاسخ درست: In early period of human history`

**آنچه نوشته شد:**

1. **مجاور / همسایه / کنار هم**  `adj` `/əˈdʒeɪsnt/` · سنجیده نشده
   - *next to or very near something else*
   - مترادف: neighbouring, abutting, contiguous · متضاد: distant, remote
   - «Our office is adjacent to the main library.»
     دفتر ما مجاور کتابخانهٔ مرکزی است.

**اشتباه‌انداز:**
- `adjoining` — adjoining یعنی چسبیده و دارای دیوار یا مرز مشترک؛ adjacent می‌تواند فقط نزدیک باشد

**شما:** ________________

### elusive   ·   `C1`

`سنجیده‌شده=0× · کلید=0× · بافتی=1× · اولویت=0`

**جملهٔ آزمون (عیناً):**

> The new movie remains tonally elusive, changing at times scene by scene or even moment by
> moment between playful comedy and something more ..... and ruminative.
>
> `arshad-1398-p05 q22 · در متن سؤال · پاسخ درست: downcast`

**آنچه نوشته شد:**

1. **توصیف‌ناپذیر / مبهم / دیریاب**  `adj` `/iˈluːsɪv/` · سنجیده نشده
   - *hard to describe, define or remember exactly*
   - مترادف: indefinable, intangible · متضاد: obvious, clear-cut
   - «The charm of the old city is real but elusive.»
     جذابیت شهر قدیمی واقعی است اما توصیفش دشوار است.
2. **دست‌نیافتنی / گریزپا**  `adj` `/iˈluːsɪv/` · سنجیده نشده
   - *difficult to find, catch or achieve*
   - مترادف: evasive, slippery · متضاد: attainable
   - «A cure for the disease has remained elusive for decades.»
     درمان این بیماری دهه‌هاست دست‌نیافتنی مانده است.

**اشتباه‌انداز:**
- `illusive` — تلفظ تقریباً یکسان؛ اما illusive یعنی توهمی و خیالی، نه دیریاب

**شما:** ________________

### render   ·   `C1`

`سنجیده‌شده=0× · کلید=0× · بافتی=1× · اولویت=0`

**جملهٔ آزمون (عیناً):**

> Grammatical elements (both function words and inflectional affixes) are not translated
> directly, ..... rendered by grammatical-value labels, generally in abbreviated form.
>
> `arshad-1402-p04 q2 · در متن سؤال · پاسخ درست: but are`

**آنچه نوشته شد:**

1. **برگرداندن / ترجمه کردن / بازنمایاندن**  `v` `/ˈrendə(r)/` · سنجیده نشده
   - *to express or translate something into another language or form*
   - مترادف: translate, express · متضاد: —
   - «The translator rendered the poem into plain modern prose.»
     مترجم آن شعر را به نثر سادهٔ امروزی برگرداند.
2. **کردن (به حالتی درآوردن) / ساختن**  `v` `/ˈrendə(r)/` · سنجیده نشده
   - *to cause someone or something to be in a particular state or condition*
   - مترادف: make, leave · متضاد: —
   - «The injury rendered him unable to walk for months.»
     آن آسیب‌دیدگی او را ماه‌ها ناتوان از راه رفتن کرد.
3. **ارائه دادن (خدمت) / رساندن (کمک)**  `v` `/ˈrendə(r)/` · سنجیده نشده
   - *to give or provide a service or help, especially formally*
   - مترادف: provide, furnish · متضاد: withhold
   - «The hospital rendered assistance to everyone injured in the crash.»
     بیمارستان به همهٔ مصدومان تصادف کمک‌رسانی کرد.

**اشتباه‌انداز:** هیچ — عمداً خالی گذاشته شد.

**شما:** ________________

---

## ۵. واژهٔ بافتی ردهٔ ۱ — فقط در متن سؤال آمده‌اند، نه در گزینه‌ها

هیچ‌وقت سنجیده نشده‌اند، پس `testedIn` خالی است و تنها شاهدِ معنی، همان جملهٔ آزمون است.

### extraneous   ·   `C1`

`سنجیده‌شده=0× · کلید=0× · بافتی=3× · اولویت=0`

**جملهٔ آزمون (عیناً):**

> I omitted all the extraneous details while explaining the ..... of the matter to him.
>
> `arshad-1399-p02 q1 · در متن سؤال · پاسخ درست: gist`

**آنچه نوشته شد:**

1. **نامربوط / زائد / بیرونی**  `adj` `/ɪkˈstreɪniəs/` · سنجیده نشده
   - *not directly connected with or relevant to the matter being dealt with*
   - مترادف: irrelevant, superfluous, immaterial · متضاد: relevant, pertinent, germane
   - «The editor cut every extraneous detail from the report.»
     ویراستار همهٔ جزئیات نامربوط را از گزارش حذف کرد.

**اشتباه‌انداز:**
- `extrinsic` — هر دو «بیرونی»‌اند، اما extrinsic یعنی ذاتی نیست و از بیرون می‌آید؛ extraneous یعنی به موضوع ربطی ندارد

**شما:** ________________

### avocation   ·   `C2`

`سنجیده‌شده=0× · کلید=0× · بافتی=1× · اولویت=0`

**جملهٔ آزمون (عیناً):**

> A ..... by avocation, Charlene loved to visit the Franklin Mint, D.C., because it had a
> famous collection of rare and antique coins.
>
> `arshad-1402-p05 q18 · در متن سؤال · پاسخ درست: numismatist`

**آنچه نوشته شد:**

1. **سرگرمی / کار ذوقی / شغل جانبی**  `n` `/ˌævəʊˈkeɪʃn/` · سنجیده نشده
   - *a hobby or activity someone does regularly besides their main job*
   - مترادف: hobby, pastime, sideline · متضاد: vocation, profession
   - «A surgeon by profession, he was a jazz pianist by avocation.»
     حرفه‌اش جراحی بود و از سر ذوق، پیانیست جاز.

**اشتباه‌انداز:**
- `vocation` — دقیقاً نقطهٔ مقابل؛ vocation شغل اصلی و رسالت است و avocation کار ذوقی در کنار آن

**شما:** ________________

### contrition   ·   `C2`

`سنجیده‌شده=0× · کلید=0× · بافتی=1× · اولویت=0`

**جملهٔ آزمون (عیناً):**

> I would not have minded if Mike had gotten off relatively lightly— ..... contrition and
> begged forgiveness.
>
> `arshad-1403-p04 q3 · در متن سؤال · پاسخ درست: provided that the charges he had admitted, shown`

**آنچه نوشته شد:**

1. **پشیمانی / ندامت / توبه**  `n` `/kənˈtrɪʃn/` · سنجیده نشده
   - *sincere sorrow and regret for having done something wrong*
   - مترادف: remorse, repentance, penitence · متضاد: impenitence
   - «His apology sounded rehearsed and showed little real contrition.»
     عذرخواهی‌اش از پیش تمرین‌شده به نظر می‌رسید و پشیمانی واقعی چندانی در آن نبود.

**اشتباه‌انداز:**
- `contribution` — شباهت ظاهری و شنیداری؛ contribution یعنی سهم و کمک و هیچ ربطی به پشیمانی ندارد

**شما:** ________________

---

## ۶. اصطلاح تخصصی — `domain`

باید اصطلاح رایج همان رشته به کار برود، نه ترجمهٔ عمومی.

### covariance   ·   `C2`

`سنجیده‌شده=0× · کلید=0× · بافتی=1× · اولویت=0` · `domain=['1121']`

**جملهٔ آزمون (عیناً):**

> Moreover, patterns of covariance of optimism/pessimism and mood across individuals do not
> necessarily ..... covariance within individuals.
>
> `arshad-1403-p04 q30 · در متن سؤال · پاسخ درست: mimic`

**آنچه نوشته شد:**

1. **کوواریانس / هم‌پراکندگی**  `n` `/kəʊˈveəriəns/` · سنجیده نشده
   - *a statistical measure of how much two variables change together*
   - مترادف: — · متضاد: —
   - «A positive covariance means the two variables tend to rise together.»
     کوواریانس مثبت یعنی دو متغیر معمولاً با هم افزایش می‌یابند.

**اشتباه‌انداز:**
- `variance` — واریانس پراکندگی یک متغیر را می‌سنجد؛ کوواریانس رابطهٔ تغییرات دو متغیر را

**شما:** ________________

### morphology   ·   `C2`

`سنجیده‌شده=0× · کلید=0× · بافتی=1× · اولویت=0` · `domain=['1110']`

**جملهٔ آزمون (عیناً):**

> Linguists sometimes use the terms analytic and synthetic to describe ..... morphology is
> made use of in a language.
>
> `arshad-1402-p04 q1 · در متن سؤال · پاسخ درست: the degree to which`

**آنچه نوشته شد:**

1. **صرف / ساخت‌واژه**  `n` `/mɔːˈfɒlədʒi/` · سنجیده نشده
   - *in linguistics, the study of how words are built out of smaller meaningful parts*
   - مترادف: — · متضاد: —
   - «English morphology explains how "unhappiness" is built from three parts.»
     صرفِ انگلیسی توضیح می‌دهد که واژهٔ «unhappiness» چگونه از سه جزء ساخته شده است.
2. **ریخت‌شناسی**  `n` `/mɔːˈfɒlədʒi/` · سنجیده نشده
   - *in biology, the form and structure of living things*
   - مترادف: — · متضاد: —
   - «The two fish look alike but differ in the morphology of their fins.»
     آن دو ماهی شبیه هم‌اند اما ریخت‌شناسی باله‌هایشان فرق دارد.

**اشتباه‌انداز:**
- `phonology` — صرف دربارهٔ ساختِ واژه است؛ واج‌شناسی دربارهٔ نظام آواهای زبان

**شما:** ________________

---
