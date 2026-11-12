// Admin account limits shared by the profile and reset screens and their actions
// (S-026, S-036). Dependency-free so a page can use them without pulling zod into the browser.

/** New passwords: at least 10 characters; Supabase Auth stores at most 72. */
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 72;

/** My profile name (S-036 AC2). */
export const PROFILE_NAME_MAX = 80;
