// Drizzle schema (PostgreSQL on Supabase). Design: docs/architecture/data-model.md.
// Tables live in ./tables by domain; this barrel is what drizzle-kit and the app import.
// `auth.users` is intentionally not re-exported (Supabase owns it).
export * from "./tables/enums";
export * from "./tables/people";
export * from "./tables/catalogue";
export * from "./tables/orders";
export * from "./tables/settings";
export * from "./tables/system";
export * from "./tables/content";
export * from "./tables/reviews";
export type * from "./tables/json-types";
