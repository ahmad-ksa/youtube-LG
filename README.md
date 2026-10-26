# YouTube LG

YouTube بدون إعلانات لشاشات LG webOS (مجرّب لـ 55NU8E0B6LA)، مع SponsorBlock.

مبني تلقائيًا من [webosbrew/youtube-webos](https://github.com/webosbrew/youtube-webos) (رخصة GPL-3.0) — كل يوم يفحص GitHub Actions المصدر، وإذا تحدّث يبني `ipk` جديد وينشره في Releases.

## التثبيت
1. ثبّت **Developer Mode** من LG Content Store وفعّله (حساب LG Developer).
2. ثبّت **Homebrew Channel** عبر [webOS Dev Manager](https://github.com/webosbrew/dev-manager-desktop).
3. احذف تطبيق YouTube الرسمي (نفس الـ id).
4. في Homebrew Channel ← Settings ← Add repository:
   `https://raw.githubusercontent.com/ahmad-ksa/youtube-lg/repo/apps.json`
5. ثبّت **YouTube LG** — والتحديثات تظهر تلقائيًا هناك.

أو حمّل `.ipk` من [Releases](https://github.com/ahmad-ksa/youtube-lg/releases/latest) وثبّته بـ Dev Manager.

## الرخصة
GPL-3.0 — الشيفرة الأصلية لمطوري webosbrew/youtube-webos.
