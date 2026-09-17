# Calibration review - word data for 25 words

**Date:** 2026-09-17 · **Branch:** `feat/stem-vocab-selection`

These 25 of 2,098 words are written **and applied to `content/lexicon/`**, so you are
reading the real output rather than a sample on paper. No other word was touched.

They were picked to **expose disagreement**, not to look good: the top of the queue, the
middle of it, the polysemous ones, the ones with a real konkour confusable, the context
words, and the domain terms.

**How to answer:** every word has a `**You:**` line - write there wherever you disagree.
But the **nine open questions** below matter more than any single word: your answers decide
how the remaining 2,073 get written. Answer those first.

---

## Open questions - answer these first

### Q1. How many senses should a word get?

The rule I applied: **the exam's meaning first, then at most one or two further meanings a
candidate genuinely needs.** You can see the result on `run`: I wrote 4 senses, only 2 of
which the exam tested.

- **(a) Only the tested senses.** Cheaper and more focused, but the `run` card teaches
  "خطر کردن" and not "دویدن".
- **(b) What I did** - tested sense first, plus one or two core everyday meanings.
- **(c) A full dictionary entry.** Expensive, and too much for a flashcard.

**You:** ________________

### Q2. Is `level` the level of the word, or of the meaning?

ADR-0012 says it is the level of the *word*, so `run` got `A1`. But the meaning the exam
tested (`run the risk of`) is really `C1`. If we later ship the level-graded edition, `run`
goes into the beginner tier carrying content that is not beginner.

- **(a)** Leave it as the word's level.
- **(b)** Use the level of the **first sense** (the tested one).
- **(c)** Give every `sense` its own level. More precise, more expensive.

**You:** ________________

### Q3. Should `testedIn` cover distractor occurrences too?

Lint rule 13 says every `tested` occurrence must be claimed by some sense - including the
ones where the word was a **wrong option**. For `withdraw` that meant judging which sense a
candidate reads a wrong option in, and in a few places that judgement is genuinely arguable.

- **(a)** Leave it - every occurrence claimed, some judgement calls included.
- **(b)** `testedIn` carries only the occurrences where the word was the **key**, and rule 13
  softens. Safer data, but the sense-to-question link gets much thinner.

**You:** ________________

### Q4. A meaning that only lives inside one collocation

I gave `vicious` two senses and put `vicious circle` (دور باطل) **first**, because the 1404
question turns on exactly that collocation - `cruel`, `fierce` and `severe` all mean
"vicious" but none of them fits `circle`.

Is a collocation-bound meaning its own sense, or should it have been a note under the main
sense?

**You:** ________________

### Q5. Tone and length of the examples

Examples run 8-14 words, full sentences, and **none of them is the exam sentence** (that is
joined in at build time). I wrote the Persian **fluently** rather than word-for-word.

Shorter? Are the translations too free, or right?

**You:** ________________

### Q6. How many Persian translations per sense?

I wrote 1 to 3, most common first. `translations` is the field the app actually shows, so
the count drives how crowded a card looks.

**You:** ________________

### Q7. English `definition` - register and length

Learner-dictionary register, not a synonym. For `impede`: "to slow something down or make it
more difficult to move or happen".

**You:** ________________

### Q8. What language do the notes use?

`confusables[].note` is **Persian**, because it is shown to the user. `homograph.note` is
**English**, because it is a note to you and never reaches the user.

**You:** ________________

### Q9. Three words raised a `homograph` flag - the split is your call

`content`, `bear` and `bolt` all carry `homograph.suspected: true` with a proposed split.
**I renamed no file** (constitution rule 6). Per the lint checklist the split has to happen
**before any user has progress on the id** - which means now, not after launch.

- `content` - noun /ˈkɒntent/ (محتوا) vs adjective /kənˈtent/ (راضی). Different stress,
  different part of speech, unrelated for a learner.
- `bear` - the verb (تحمل کردن) vs the animal (خرس). CLAUDE.md names this case itself.
- `bolt` - the fastener (پیچ/کلون) vs the verb "to dash away" (رم کردن).

**You:** ________________

---

## 1. Top of the queue - the five most-tested words

Built first, and the most-seen words in the app.

### perilous   ·   `C1`

`tested=10× · key=7× · context=0× · priority=32`

**Exam sentence (verbatim):**

> You should avoid driving during the snowstorm because the icy roads are ..... .
>
> `arshad-1400-p01 q10 · KEY · answer: perilous`

> Since the journey is ....., be sure to bring a first-aid kit.
>
> `arshad-1400-p03 q3 · KEY · answer: perilous`

*(and 3 other distinct sentences)*

**What was written:**

1. **پرخطر / خطرناک / مخاطره‌آمیز**  `adj` `/ˈperələs/` · 10 exam occurrence(s)
   - *very dangerous, especially because someone could be badly hurt or killed*
   - syn: hazardous, treacherous, precarious · ant: safe, secure
   - «The mountain path becomes perilous after heavy rain.»
     مسیر کوهستانی بعد از باران شدید پرخطر می‌شود.

**Confusables:** none - deliberately left empty.

**You:** ________________

### derive   ·   `B2`

`tested=9× · key=2× · context=0× · priority=23`

**Exam sentence (verbatim):**

> Immigration ..... from the Latin word migration and means the act of a foreigner entering a
> country in the aim of obtaining the right of permanent residence.
>
> `arshad-1402-p03 q2 · KEY · answer: derives`

> The islands ..... their name from the sacred images found on them by the early European
> navigators.
>
> `arshad-1401-p02 q2 · KEY · answer: derive`

*(and 4 other distinct sentences)*

**What was written:**

1. **به دست آوردن از / گرفتن از / کسب کردن**  `v` `/dɪˈraɪv/` · 5 exam occurrence(s)
   - *to get or obtain something from a particular source*
   - syn: obtain, gain, draw · ant: —
   - «Chemists derive many useful drugs from ordinary plants.»
     شیمی‌دان‌ها بسیاری از داروهای مفید را از گیاهان معمولی به دست می‌آورند.
2. **ریشه گرفتن از / برگرفته شدن از / نشئت گرفتن**  `v` `/dɪˈraɪv/` · 4 exam occurrence(s)
   - *to have something as its origin; to come from something*
   - syn: originate, stem, spring · ant: —
   - «The English word "salary" derives from the Latin word for salt.»
     واژهٔ انگلیسی «salary» از واژهٔ لاتین به معنای نمک ریشه گرفته است.

**Confusables:**
- `deprive` — شباهت ظاهری؛ deprive یعنی محروم کردن و هم‌ریشهٔ derive نیست

**You:** ________________

### affluent   ·   `C1`

`tested=6× · key=5× · context=0× · priority=22`

**Exam sentence (verbatim):**

> Nationwide, poor children and adolescents are participating far less in sports and fitness
> activities than their more ..... peers.
>
> `arshad-1404-p01 q6 · KEY · answer: affluent`

> The writer's stories appeal to a wide range of people—young and old, ..... and poor,
> literary and nonliterary.
>
> `arshad-1400-p03 q4 · KEY · answer: affluent`

*(and 1 other distinct sentences)*

**What was written:**

1. **مرفه / ثروتمند / متمکن**  `adj` `/ˈæfluənt/` · 6 exam occurrence(s)
   - *having plenty of money and a comfortable standard of living*
   - syn: wealthy, prosperous, well-off · ant: impecunious, destitute, needy
   - «They grew up in an affluent neighbourhood where every family owned two cars.»
     آن‌ها در محله‌ای مرفه بزرگ شدند که هر خانواده در آن دو خودرو داشت.

**Confusables:**
- `effluent` — تلفظ و املای بسیار نزدیک، اما effluent یعنی پساب و فاضلاب

**You:** ________________

### apprehensive   ·   `C1`

`tested=6× · key=5× · context=0× · priority=22`

**Exam sentence (verbatim):**

> I was in need of money and not at all ..... about experiments, so I concurred and received
> the new medicine at the local hospital.
>
> `arshad-1405-p03 q6 · KEY · answer: apprehensive`

> Although Mr. Jackson was ....., he attempted to be jovial so that his colleagues at the
> meeting wouldn't think there was a problem.
>
> `arshad-1400-p03 q7 · KEY · answer: apprehensive`

*(and 1 other distinct sentences)*

**What was written:**

1. **دلواپس / نگران / بیمناک**  `adj` `/ˌæprɪˈhensɪv/` · 6 exam occurrence(s)
   - *worried or nervous that something unpleasant is going to happen*
   - syn: anxious, uneasy, fearful · ant: confident, unconcerned
   - «She felt apprehensive about her first day at the new school.»
     او دربارهٔ نخستین روزش در مدرسهٔ جدید دلواپس بود.

**Confusables:**
- `comprehensive` — شباهت ظاهری؛ comprehensive یعنی جامع و فراگیر، نه نگران
- `apprehend` — هم‌ریشه است اما فعل و به معنای دستگیر کردن یا درک کردن

**You:** ________________

### withdraw   ·   `B2`

`tested=11× · key=1× · context=0× · priority=21`

**Exam sentence (verbatim):**

> They were forced to ---------- the accusation and issue a full apology live on air.
>
> `arshad-1400-p11 q35 · KEY · answer: withdraw`

> The celebrity will ..... assistance from the police to keep stalkers away from his property.
>
> `arshad-1402-p01 q6 · distractor · answer: invoke`

*(and 5 other distinct sentences)*

**What was written:**

1. **پس گرفتن / پس کشیدن (حرف یا حمایت)**  `v` `/wɪðˈdrɔː/` · 2 exam occurrence(s)
   - *to say officially that something you said or offered is no longer true or available*
   - syn: retract, revoke, rescind · ant: affirm, uphold
   - «The newspaper withdrew the claim once the evidence had been checked.»
     روزنامه پس از بررسی مدارک، آن ادعا را پس گرفت.
2. **برداشت کردن / بیرون کشیدن / خارج کردن**  `v` `/wɪðˈdrɔː/` · 3 exam occurrence(s)
   - *to take money out of a bank account, or to remove something from a place*
   - syn: extract, remove · ant: deposit
   - «He withdrew a small amount from his savings account.»
     او مبلغ کمی از حساب پس‌اندازش برداشت کرد.
3. **عقب کشیدن / کناره‌گیری کردن / انصراف دادن**  `v` `/wɪðˈdrɔː/` · 6 exam occurrence(s)
   - *to move back or away from a place or situation, or to stop taking part in something*
   - syn: retreat, pull out, back off · ant: advance, engage
   - «Two runners withdrew from the race after the first lap.»
     دو دونده پس از دور اول از مسابقه کناره‌گیری کردند.

**Confusables:**
- `withhold` — withdraw یعنی چیزی را که داده‌ای پس بگیری؛ withhold یعنی از همان اول ندهی

**You:** ________________

---

## 2. Middle of the queue - five words tested once

The bulk of the job looks like this: one appearance across ten years of exams.

### impede   ·   `C1`

`tested=1× · key=1× · context=0× · priority=5`

**Exam sentence (verbatim):**

> It is said that "the El" did not meet the historic criteria for being registered, as it
> ..... the view from the street of other historic buildings and because the structure
> generally downgraded the quality of life in the city.
>
> `arshad-1404-p01 q7 · KEY · answer: impeded`

**What was written:**

1. **مانع شدن / سد راه شدن / کند کردن**  `v` `/ɪmˈpiːd/` · 1 exam occurrence(s)
   - *to slow something down or make it more difficult to move or happen*
   - syn: hinder, obstruct, hamper · ant: facilitate, expedite
   - «Thick fog impeded the rescue team's progress up the mountain.»
     مه غلیظ مانع پیشروی تیم نجات به سمت بالای کوه شد.

**Confusables:**
- `impel` — شباهت ظاهری اما تقریباً معنای عکس؛ impel یعنی وادار کردن و به حرکت واداشتن

**You:** ________________

### vicious   ·   `B2`

`tested=1× · key=1× · context=0× · priority=5`

**Exam sentence (verbatim):**

> The situation turned into a .................... circle: the more he struggled, the more he
> was criticized; the more he was criticized, the more he struggled.
>
> `arshad-1404-p05 q14 · KEY · answer: vicious`

**What was written:**

1. **باطل (در ترکیب vicious circle: دور باطل) / معیوب**  `adj` `/ˈvɪʃəs/` · 1 exam occurrence(s)
   - *used in the phrase "vicious circle" or "vicious cycle", to describe a situation in which each problem causes another and makes the whole thing worse*
   - syn: — · ant: virtuous
   - «Debt and low pay form a vicious circle that is hard to escape.»
     بدهی و دستمزد پایین دور باطلی می‌سازند که گریز از آن دشوار است.
2. **بی‌رحم / درنده‌خو / وحشیانه**  `adj` `/ˈvɪʃəs/` · never tested
   - *cruel and violent, or intended to hurt someone*
   - syn: brutal, savage, ferocious · ant: gentle, kindly
   - «The dog had a vicious temper and could not be left with children.»
     آن سگ خویی درنده داشت و نمی‌شد او را کنار بچه‌ها گذاشت.

**Confusables:**
- `viscous` — املا و تلفظ بسیار نزدیک، اما viscous یعنی غلیظ و چسبناک

**You:** ________________

### bulwark   ·   `C2`

`tested=1× · key=0× · context=0× · priority=3`

**Exam sentence (verbatim):**

> The phrase "sibling rivalry" is hardly adequate to describe the ..... between J R and Colin,
> whose interaction consists of almost nonstop sniping, undermining and other forms of verbal
> abuse.
>
> `arshad-1399-p08 q26 · distractor · answer: animus`

**What was written:**

1. **سنگر / دژ دفاعی / سپر محافظ**  `n` `/ˈbʊlwək/` · 1 exam occurrence(s)
   - *something or someone that protects or defends against danger or attack*
   - syn: rampart, safeguard, defence · ant: —
   - «An independent press is a bulwark against the abuse of power.»
     مطبوعات مستقل سنگری در برابر سوءاستفاده از قدرت است.

**Confusables:** none - deliberately left empty.

**You:** ________________

### dwell   ·   `C1`

`tested=1× · key=0× · context=0× · priority=3`

**Exam sentence (verbatim):**

> ..... uncertainty requires a shift in mindset that acknowledges that life is ever-changing,
> and that certainty is an illusion.
>
> `arshad-1405-p05 q10 · distractor · answer: Embracing`

**What was written:**

1. **مدام به چیزی فکر کردن / روی چیزی ماندن / کِش دادن موضوع**  `v` `/dwel/` · 1 exam occurrence(s)
   - *to keep thinking or talking about something, especially something unpleasant (usually "dwell on")*
   - syn: brood, linger on · ant: dismiss, move on
   - «Try not to dwell on mistakes you can no longer fix.»
     سعی کن مدام به اشتباه‌هایی که دیگر نمی‌توانی جبرانشان کنی فکر نکنی.
2. **سکونت داشتن / زیستن / ساکن بودن**  `v` `/dwel/` · never tested
   - *to live in a particular place (formal or literary)*
   - syn: reside, inhabit · ant: —
   - «Few people still dwell in the old part of the village.»
     افراد کمی هنوز در بخش قدیمی روستا سکونت دارند.

**Confusables:**
- `dwindle` — شباهت ظاهری؛ dwindle یعنی کم‌کم کاهش یافتن و آب رفتن

**You:** ________________

### propitious   ·   `C2`

`tested=1× · key=0× · context=0× · priority=3`

**Exam sentence (verbatim):**

> Brad's thesis is that attempts to ground moral status on a single criterion have been
> unsuccessful, as they inevitably lead to ..... measures to fit diverse values into a single
> mold.
>
> `arshad-1403-p04 q21 · distractor · answer: procrustean`

**What was written:**

1. **مساعد / مناسب / خوش‌یُمن**  `adj` `/prəˈpɪʃəs/` · 1 exam occurrence(s)
   - *likely to produce a good result; favourable for a particular activity*
   - syn: auspicious, favourable, opportune · ant: inauspicious, unfavourable
   - «The calm sea and clear sky were propitious for the launch.»
     دریای آرام و آسمان صاف برای پرتاب مساعد بود.

**Confusables:**
- `precipitous` — شباهت ظاهری؛ precipitous یعنی بسیار پرشیب یا شتاب‌زده

**You:** ________________

---

## 3. Polysemous - where `senses[]` has to carry more than one entry

The exam tested only one of the meanings. The question is how many to write.

### content   ·   `B1`

`tested=2× · key=1× · context=0× · priority=8`

**Exam sentence (verbatim):**

> Advertisements for breakfast cereals have, for many years, been found to be especially fond
> of fantasy techniques, with almost nine out of ten including such ..... .
>
> `arshad-1402-p06 q24 · KEY · answer: content`

> My father has always been ..... with his money. I didn't have to pay for college or even for
> the confused year I spent at Princeton taking graduate courses in sociology.
>
> `arshad-1404-p01 q3 · distractor · answer: generous`

**What was written:**

1. **محتوا / مضمون / مطالب**  `n` `/ˈkɒntent/` · 1 exam occurrence(s)
   - *the subject matter or material contained in a book, programme, speech or website*
   - syn: substance, material · ant: form
   - «The book's content is excellent, but the title is misleading.»
     محتوای کتاب عالی است، اما عنوانش گمراه‌کننده است.
2. **راضی / خرسند / قانع**  `adj` `/kənˈtent/` · 1 exam occurrence(s)
   - *happy and satisfied with what you have, without wanting more*
   - syn: satisfied, at ease · ant: discontented, dissatisfied
   - «She is content with a small house and a quiet life.»
     او به خانه‌ای کوچک و زندگی‌ای آرام راضی است.

**Confusables:**
- `contentment` — اسمِ حالتِ رضایت است، نه محتوا؛ content به معنای محتوا اسمی جداگانه است

**⚠ homograph flag:** Different stress and different part of speech: the noun /ˈkɒntent/ (subject matter) and the adjective /kənˈtent/ (satisfied). A learner will not guess one from the other, so the card must show the two senses as separate blocks and a hint must say which one it targets.

**You:** ________________

### run   ·   `C1`

`tested=2× · key=2× · context=0× · priority=10`

**Exam sentence (verbatim):**

> If exploitation of the planet's resources continues as at present, then the lifestyle we
> currently enjoy ..... the risk of causing significant damage to the world.
>
> `arshad-1401-p01 q10 · KEY · answer: runs`

> By 1979, the total borrowings and losses of state-owned industries were ..... at about £3
> billion a year.
>
> `arshad-1398-p07 q177 · KEY · answer: running`

**What was written:**

1. **در معرض خطر بودن / خطر کردن / ریسک کردن**  `v` `/rʌn/` · 1 exam occurrence(s)
   - *to be in a situation where something bad could happen to you, as in "run a risk" or "run the risk of"*
   - syn: risk, incur · ant: —
   - «If you skip the backup, you run the risk of losing everything.»
     اگر از پشتیبان‌گیری صرف‌نظر کنی، در معرض خطرِ از دست دادن همه چیز قرار می‌گیری.
2. **بالغ بودن بر / در سطحِ ... بودن / رسیدن به (میزان)**  `v` `/rʌn/` · 1 exam occurrence(s)
   - *to be at a particular level, rate or amount*
   - syn: stand at, amount to · ant: —
   - «Inflation was running at nearly forty percent that year.»
     تورم در آن سال نزدیک به چهل درصد بود.
3. **دویدن**  `v` `/rʌn/` · never tested
   - *to move quickly on foot, faster than walking*
   - syn: sprint, dash · ant: walk
   - «He runs five kilometres every morning before work.»
     او هر روز صبح پیش از کار پنج کیلومتر می‌دود.
4. **اداره کردن / گرداندن**  `v` `/rʌn/` · never tested
   - *to manage or be in charge of a business or organization*
   - syn: manage, operate · ant: —
   - «Her sister runs a small bakery near the station.»
     خواهرش نانوایی کوچکی نزدیک ایستگاه اداره می‌کند.

**Confusables:** none - deliberately left empty.

**You:** ________________

### address   ·   `B2`

`tested=2× · key=1× · context=0× · priority=8`

**Exam sentence (verbatim):**

> When you ..... a meeting, it is important to speak clearly, confidently and at a good pace.
>
> `arshad-1402-p01 q1 · KEY · answer: address`

> It is hardly surprising that most explorations of the future of cities and approaches to
> developing urban strategies ..... to incorporate questions related to the governance of
> cities.
>
> `arshad-1404-p06 q21 · distractor · answer: tend`

**What was written:**

1. **سخنرانی کردن برای / خطاب قرار دادن**  `v` `/əˈdres/` · 1 exam occurrence(s)
   - *to give a formal speech to a group of people*
   - syn: speak to · ant: —
   - «The minister will address the conference on Monday morning.»
     وزیر صبح دوشنبه در همایش سخنرانی خواهد کرد.
2. **پرداختن به / رسیدگی کردن به / مورد توجه قرار دادن**  `v` `/əˈdres/` · 1 exam occurrence(s)
   - *to deal with a problem or question, or to give attention to it*
   - syn: tackle, deal with · ant: ignore, neglect
   - «The report fails to address the cost of the plan.»
     گزارش به هزینهٔ این طرح نمی‌پردازد.
3. **نشانی / آدرس**  `n` `/əˈdres/` · never tested
   - *the details of the place where someone lives or where mail is delivered*
   - syn: — · ant: —
   - «Please write your full address on the back of the form.»
     لطفاً نشانی کامل خود را پشت فرم بنویسید.

**Confusables:** none - deliberately left empty.

**You:** ________________

### bear   ·   `B2`

`tested=1× · key=0× · context=0× · priority=3`

**Exam sentence (verbatim):**

> The programmer ..... an analogy between the human brain and the computer.
>
> `arshad-1398-p02 q5 · distractor · answer: drew`

**What was written:**

1. **داشتن (شباهت یا نشانه) / حمل کردن (نشان)**  `v` `/beə(r)/` · 1 exam occurrence(s)
   - *to have or show a particular quality or relation, as in "bear a resemblance to" something*
   - syn: carry, have · ant: —
   - «The copy bears no resemblance to the original painting.»
     آن نسخه هیچ شباهتی به نقاشی اصلی ندارد.
2. **تحمل کردن / برتافتن / طاقت آوردن**  `v` `/beə(r)/` · never tested
   - *to accept or endure something unpleasant without complaining*
   - syn: endure, tolerate, stand · ant: —
   - «He could not bear the noise from the street any longer.»
     او دیگر نمی‌توانست سروصدای خیابان را تحمل کند.
3. **خرس**  `n` `/beə(r)/` · never tested
   - *a large heavy wild animal with thick fur and sharp claws*
   - syn: — · ant: —
   - «A brown bear was seen near the campsite at dawn.»
     سپیده‌دم خرسی قهوه‌ای نزدیک اردوگاه دیده شد.

**Confusables:**
- `bare` — هم‌آوا با bear؛ اما bare یعنی برهنه، خالی و بدون پوشش

**⚠ homograph flag:** The verb (endure / have as a feature) and the noun (the animal) share nothing but a spelling. Only the verb was ever tested, so the animal sense is there for completeness; a hint must say which sense it targets.

**You:** ________________

### bolt   ·   `B2`

`tested=1× · key=0× · context=0× · priority=3`

**Exam sentence (verbatim):**

> Everyone seemed to have a specific role except me. I felt like a fifth ..... .
>
> `arshad-1399-p08 q16 · distractor · answer: wheel`

**What was written:**

1. **پیچ (با مهره) / کلون / چفت**  `n` `/bəʊlt/` · 1 exam occurrence(s)
   - *a thick metal pin used with a nut to fasten things together, or a bar that slides across to lock a door*
   - syn: pin, latch · ant: —
   - «The gate is held shut by a heavy iron bolt.»
     دروازه با کلونی سنگین و آهنی بسته نگه داشته می‌شود.
2. **آذرخش / صاعقه**  `n` `/bəʊlt/` · never tested
   - *a sudden flash of lightning that strikes the ground*
   - syn: thunderbolt · ant: —
   - «A bolt of lightning split the old oak in half.»
     آذرخشی بلوط کهنسال را از وسط شکافت.
3. **رم کردن / در رفتن / ناگهان گریختن**  `v` `/bəʊlt/` · never tested
   - *to run away suddenly and very fast, especially because of fear*
   - syn: dash, flee · ant: —
   - «The horse bolted as soon as it heard the gunshot.»
     اسب به‌محض شنیدن صدای شلیک رم کرد.

**Confusables:** none - deliberately left empty.

**⚠ homograph flag:** The fastener, the lightning flash and the verb "to dash away" are far apart for a learner even though they share a root. Only the fastener was tested; the card must keep the three visibly separate.

**You:** ________________

---

## 4. Words with a confusable - `confusables`

Konkour distractors are built from exactly this.

### conscience   ·   `B2`

`tested=0× · key=0× · context=2× · priority=0`

**Exam sentence (verbatim):**

> When it is a straight choice between survival and an environmental conscience, the former
> wins out every time, and instinct as well as their sense of responsibility to their families
> will compel farmers and community leaders to hunt and kill dangerous predators ..... around
> their villages in the night, and herds of elephants capable of stampeding their way through
> .....
>
> `arshad-1400-p09 q35 · in the stem · answer: prowling`

> When it is a straight choice between survival and an environmental conscience, the former
> wins out every time, and instinct as well as their sense of responsibility to their families
> will compel farmers and community leaders to hunt and kill dangerous predators prowling
> around their villages in the night, and herds of elephants capable of stampeding their way
> through .....
>
> `arshad-1400-p09 q36 · in the stem · answer: flattening whole towns`

**What was written:**

1. **وجدان / وجدان اخلاقی**  `n` `/ˈkɒnʃəns/` · never tested
   - *the sense inside you that tells you whether what you are doing is right or wrong*
   - syn: scruples, moral sense · ant: —
   - «He could not silence his conscience after keeping the money.»
     پس از برداشتن آن پول نتوانست وجدانش را ساکت کند.

**Confusables:**
- `conscious` — صفت است و یعنی هوشیار یا آگاه؛ conscience اسم است و یعنی وجدان
- `conscientious` — صفت و یعنی وظیفه‌شناس و باوجدان در کار

**You:** ________________

### contentment   ·   `B2`

`tested=0× · key=0× · context=1× · priority=0`

**Exam sentence (verbatim):**

> Despite the fact that Gross Domestic Product (GDP) has increased substantially in the
> industrialized West, the levels of human contentment have remained ..... .
>
> `arshad-1402-p03 q1 · in the stem · answer: static`

**What was written:**

1. **خرسندی / رضایت / قناعت**  `n` `/kənˈtentmənt/` · never tested
   - *a state of quiet happiness and satisfaction with what you have*
   - syn: satisfaction, ease · ant: discontent, dissatisfaction
   - «After years of striving, she found contentment in a quiet life.»
     پس از سال‌ها تلاش، خرسندی را در زندگی‌ای آرام یافت.

**Confusables:**
- `content` — content اسم که باشد یعنی محتوا؛ حالتِ رضایت را باید با contentment گفت

**You:** ________________

### adjacent   ·   `B2`

`tested=0× · key=0× · context=1× · priority=0`

**Exam sentence (verbatim):**

> In early period of human history, when voyages and travels were not undertaken from the view
> of amusement or instruction, or from political or commercial motives, the discovery of
> adjacent countries was chiefly affected by war, and of distant regions by commerce.
>
> `arshad-1399-p10 q14 · in the stem · answer: In early period of human history`

**What was written:**

1. **مجاور / همسایه / کنار هم**  `adj` `/əˈdʒeɪsnt/` · never tested
   - *next to or very near something else*
   - syn: neighbouring, abutting, contiguous · ant: distant, remote
   - «Our office is adjacent to the main library.»
     دفتر ما مجاور کتابخانهٔ مرکزی است.

**Confusables:**
- `adjoining` — adjoining یعنی چسبیده و دارای دیوار یا مرز مشترک؛ adjacent می‌تواند فقط نزدیک باشد

**You:** ________________

### elusive   ·   `C1`

`tested=0× · key=0× · context=1× · priority=0`

**Exam sentence (verbatim):**

> The new movie remains tonally elusive, changing at times scene by scene or even moment by
> moment between playful comedy and something more ..... and ruminative.
>
> `arshad-1398-p05 q22 · in the stem · answer: downcast`

**What was written:**

1. **توصیف‌ناپذیر / مبهم / دیریاب**  `adj` `/iˈluːsɪv/` · never tested
   - *hard to describe, define or remember exactly*
   - syn: indefinable, intangible · ant: obvious, clear-cut
   - «The charm of the old city is real but elusive.»
     جذابیت شهر قدیمی واقعی است اما توصیفش دشوار است.
2. **دست‌نیافتنی / گریزپا**  `adj` `/iˈluːsɪv/` · never tested
   - *difficult to find, catch or achieve*
   - syn: evasive, slippery · ant: attainable
   - «A cure for the disease has remained elusive for decades.»
     درمان این بیماری دهه‌هاست دست‌نیافتنی مانده است.

**Confusables:**
- `illusive` — تلفظ تقریباً یکسان؛ اما illusive یعنی توهمی و خیالی، نه دیریاب

**You:** ________________

### render   ·   `C1`

`tested=0× · key=0× · context=1× · priority=0`

**Exam sentence (verbatim):**

> Grammatical elements (both function words and inflectional affixes) are not translated
> directly, ..... rendered by grammatical-value labels, generally in abbreviated form.
>
> `arshad-1402-p04 q2 · in the stem · answer: but are`

**What was written:**

1. **برگرداندن / ترجمه کردن / بازنمایاندن**  `v` `/ˈrendə(r)/` · never tested
   - *to express or translate something into another language or form*
   - syn: translate, express · ant: —
   - «The translator rendered the poem into plain modern prose.»
     مترجم آن شعر را به نثر سادهٔ امروزی برگرداند.
2. **کردن (به حالتی درآوردن) / ساختن**  `v` `/ˈrendə(r)/` · never tested
   - *to cause someone or something to be in a particular state or condition*
   - syn: make, leave · ant: —
   - «The injury rendered him unable to walk for months.»
     آن آسیب‌دیدگی او را ماه‌ها ناتوان از راه رفتن کرد.
3. **ارائه دادن (خدمت) / رساندن (کمک)**  `v` `/ˈrendə(r)/` · never tested
   - *to give or provide a service or help, especially formally*
   - syn: provide, furnish · ant: withhold
   - «The hospital rendered assistance to everyone injured in the crash.»
     بیمارستان به همهٔ مصدومان تصادف کمک رساند.

**Confusables:** none - deliberately left empty.

**You:** ________________

---

## 5. Tier-1 context words - they appeared only in the stem, never as an option

Never tested, so `testedIn` is empty and the exam sentence is the only evidence of meaning.

### extraneous   ·   `C1`

`tested=0× · key=0× · context=3× · priority=0`

**Exam sentence (verbatim):**

> I omitted all the extraneous details while explaining the ..... of the matter to him.
>
> `arshad-1399-p02 q1 · in the stem · answer: gist`

**What was written:**

1. **نامربوط / زائد / بیرونی**  `adj` `/ɪkˈstreɪniəs/` · never tested
   - *not directly connected with or relevant to the matter being dealt with*
   - syn: irrelevant, superfluous, immaterial · ant: relevant, pertinent, germane
   - «The editor cut every extraneous detail from the report.»
     ویراستار همهٔ جزئیات نامربوط را از گزارش حذف کرد.

**Confusables:**
- `extrinsic` — هر دو «بیرونی»‌اند، اما extrinsic یعنی ذاتی نیست و از بیرون می‌آید؛ extraneous یعنی به موضوع ربطی ندارد

**You:** ________________

### avocation   ·   `C2`

`tested=0× · key=0× · context=1× · priority=0`

**Exam sentence (verbatim):**

> A ..... by avocation, Charlene loved to visit the Franklin Mint, D.C., because it had a
> famous collection of rare and antique coins.
>
> `arshad-1402-p05 q18 · in the stem · answer: numismatist`

**What was written:**

1. **سرگرمی / کار ذوقی / شغل جانبی**  `n` `/ˌævəʊˈkeɪʃn/` · never tested
   - *a hobby or activity someone does regularly besides their main job*
   - syn: hobby, pastime, sideline · ant: vocation, profession
   - «A surgeon by profession, he was a jazz pianist by avocation.»
     او به‌حرفه جراح بود و به‌عنوان سرگرمی، پیانیست جاز بود.

**Confusables:**
- `vocation` — دقیقاً نقطهٔ مقابل؛ vocation شغل اصلی و رسالت است و avocation کار ذوقی در کنار آن

**You:** ________________

### contrition   ·   `C2`

`tested=0× · key=0× · context=1× · priority=0`

**Exam sentence (verbatim):**

> I would not have minded if Mike had gotten off relatively lightly— ..... contrition and
> begged forgiveness.
>
> `arshad-1403-p04 q3 · in the stem · answer: provided that the charges he had admitted, shown`

**What was written:**

1. **پشیمانی / ندامت / توبه**  `n` `/kənˈtrɪʃn/` · never tested
   - *sincere sorrow and regret for having done something wrong*
   - syn: remorse, repentance, penitence · ant: impenitence
   - «His apology sounded rehearsed and showed little real contrition.»
     عذرخواهی‌اش از پیش تمرین‌شده به نظر می‌رسید و پشیمانی واقعی چندانی در آن نبود.

**Confusables:**
- `contribution` — شباهت ظاهری و شنیداری؛ contribution یعنی سهم و کمک و هیچ ربطی به پشیمانی ندارد

**You:** ________________

---

## 6. Domain terms - `domain`

Must use the discipline's own Persian term, not a general paraphrase.

### covariance   ·   `C2`

`tested=0× · key=0× · context=1× · priority=0` · `domain=['1121']`

**Exam sentence (verbatim):**

> Moreover, patterns of covariance of optimism/pessimism and mood across individuals do not
> necessarily ..... covariance within individuals.
>
> `arshad-1403-p04 q30 · in the stem · answer: mimic`

**What was written:**

1. **کوواریانس / هم‌پراکندگی**  `n` `/kəʊˈveəriəns/` · never tested
   - *a statistical measure of how much two variables change together*
   - syn: — · ant: —
   - «A positive covariance means the two variables tend to rise together.»
     کوواریانس مثبت یعنی دو متغیر معمولاً با هم افزایش می‌یابند.

**Confusables:**
- `variance` — واریانس پراکندگی یک متغیر را می‌سنجد؛ کوواریانس رابطهٔ تغییرات دو متغیر را

**You:** ________________

### morphology   ·   `C2`

`tested=0× · key=0× · context=1× · priority=0` · `domain=['1110']`

**Exam sentence (verbatim):**

> Linguists sometimes use the terms analytic and synthetic to describe ..... morphology is
> made use of in a language.
>
> `arshad-1402-p04 q1 · in the stem · answer: the degree to which`

**What was written:**

1. **صرف / ساخت‌واژه**  `n` `/mɔːˈfɒlədʒi/` · never tested
   - *in linguistics, the study of how words are built out of smaller meaningful parts*
   - syn: — · ant: —
   - «English morphology explains how "unhappiness" is built from three parts.»
     صرفِ انگلیسی توضیح می‌دهد که واژهٔ «unhappiness» چگونه از سه جزء ساخته شده است.
2. **ریخت‌شناسی**  `n` `/mɔːˈfɒlədʒi/` · never tested
   - *in biology, the form and structure of living things*
   - syn: — · ant: —
   - «The two fish look alike but differ in the morphology of their fins.»
     آن دو ماهی شبیه هم‌اند اما ریخت‌شناسی باله‌هایشان فرق دارد.

**Confusables:**
- `phonology` — صرف دربارهٔ ساختِ واژه است؛ واج‌شناسی دربارهٔ نظام آواهای زبان

**You:** ________________

---
