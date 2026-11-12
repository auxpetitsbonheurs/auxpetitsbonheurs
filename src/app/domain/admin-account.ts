// Admin account limits shared by the profile and reset screens and their actions
// (S-026, S-036). Dependency-free so a page can use them without pulling zod into the browser.

/** New passwords: at least 10 characters; Supabase Auth stores at most 72. */
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 72;

/** My profile name (S-036 AC2). */
export const PROFILE_NAME_MAX = 80;

/** Admin roles, in the order the invite sheet offers them (FR-042). */
export const ADMIN_ROLES = ["admin", "owner"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

/** An invitation link works for 7 days (FR-042). */
export const INVITE_VALID_DAYS = 7;

/** Invitation tokens are 32 random bytes in base64url: exactly 43 characters (S-029 AC7). */
export const INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
