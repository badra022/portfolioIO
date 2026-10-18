/**
 * The platform's own signature, shown at the very bottom of every teacher site
 * (components/DevCredit.tsx) and on the platform's pages. Lives in code (not in a
 * teacher's content) so teachers can't edit or remove it.
 */
export const BRAND = {
  /** The name in the logo (components/brand/OstazLogo.tsx). */
  name: "myostaz.com",
  /** Where the logo links: the platform's home page (the sign-up). */
  home: "https://myostaz.com",
};

export const DEVELOPER = {
  /** Where prospects reach out. */
  facebook: "https://www.facebook.com/badra069",
  /** Shown next to the logo when set. */
  email: "",
  phoneDisplay: "+20 115 866 7913",
  whatsapp: "201158667913",
  /** Pre-written WhatsApp message; {site} is the teacher's name. */
  message: "مرحباً، شفت موقع {site} وعايز أعمل موقع زيه.",
};
