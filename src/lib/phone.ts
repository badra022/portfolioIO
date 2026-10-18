/**
 * WhatsApp numbers on the sign-up form (components/signup/SignupFlow.tsx), checked
 * the same way in the browser and on the server (lib/server/signup.ts): Arab
 * countries only, each with its mobile number shape. Numbers are stored as
 * international digits without "+", e.g. 201012345678.
 */
export type Country = {
  /** Calling code, e.g. "20". */
  code: string;
  flag: string;
  name: string;
  /** The national mobile number after the leading 0, e.g. 1012345678 for Egypt. */
  mobile: RegExp;
  /** A sample number as people type it locally. */
  example: string;
};

export const COUNTRIES: Country[] = [
  { code: "20", flag: "🇪🇬", name: "مصر", mobile: /^1[0125]\d{8}$/, example: "01012345678" },
  { code: "966", flag: "🇸🇦", name: "السعودية", mobile: /^5\d{8}$/, example: "0512345678" },
  { code: "971", flag: "🇦🇪", name: "الإمارات", mobile: /^5[024568]\d{7}$/, example: "0501234567" },
  { code: "965", flag: "🇰🇼", name: "الكويت", mobile: /^[569]\d{7}$/, example: "50012345" },
  { code: "974", flag: "🇶🇦", name: "قطر", mobile: /^[3567]\d{7}$/, example: "33123456" },
  { code: "973", flag: "🇧🇭", name: "البحرين", mobile: /^[36]\d{7}$/, example: "36001234" },
  { code: "968", flag: "🇴🇲", name: "عُمان", mobile: /^[79]\d{7}$/, example: "92123456" },
  { code: "962", flag: "🇯🇴", name: "الأردن", mobile: /^7[789]\d{7}$/, example: "0790123456" },
  { code: "961", flag: "🇱🇧", name: "لبنان", mobile: /^(3\d{6}|[78]\d{7})$/, example: "71123456" },
  { code: "964", flag: "🇮🇶", name: "العراق", mobile: /^7[3-9]\d{8}$/, example: "07901234567" },
  { code: "970", flag: "🇵🇸", name: "فلسطين", mobile: /^5[69]\d{7}$/, example: "0599123456" },
  { code: "963", flag: "🇸🇾", name: "سوريا", mobile: /^9\d{8}$/, example: "0944123456" },
  { code: "967", flag: "🇾🇪", name: "اليمن", mobile: /^7\d{8}$/, example: "0771234567" },
  { code: "249", flag: "🇸🇩", name: "السودان", mobile: /^[19]\d{8}$/, example: "0912345678" },
  { code: "218", flag: "🇱🇾", name: "ليبيا", mobile: /^9[1-5]\d{7}$/, example: "0912345678" },
  { code: "216", flag: "🇹🇳", name: "تونس", mobile: /^[2459]\d{7}$/, example: "20123456" },
  { code: "213", flag: "🇩🇿", name: "الجزائر", mobile: /^[567]\d{8}$/, example: "0551234567" },
  { code: "212", flag: "🇲🇦", name: "المغرب", mobile: /^[67]\d{8}$/, example: "0612345678" },
];

export const DEFAULT_COUNTRY = "20";
export const countryOf = (code: string) => COUNTRIES.find((c) => c.code === code);

/**
 * The international digits for a number typed with a chosen country, or null when
 * it isn't a mobile number of an allowed country. A number typed in full
 * (+966…, 00966…) wins over the chosen country.
 */
export function normalizePhone(country: string, input: string): string | null {
  let d = input.replace(/[^\d+]/g, "");
  let c = countryOf(country);
  const full = d.startsWith("+") ? d.slice(1) : d.startsWith("00") ? d.slice(2) : null;
  if (full !== null) {
    c = [...COUNTRIES].sort((a, b) => b.code.length - a.code.length).find((x) => full.startsWith(x.code));
    if (!c) return null;
    d = full.slice(c.code.length);
  } else if (c && d.startsWith(c.code) && !c.mobile.test(d.replace(/^0/, ""))) {
    // Typed with the calling code but without "+" (e.g. 2010…).
    d = d.slice(c.code.length);
  }
  if (!c) return null;
  const national = d.replace(/^0+/, "");
  return c.mobile.test(national) ? `${c.code}${national}` : null;
}
