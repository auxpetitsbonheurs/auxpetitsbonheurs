import { pgEnum } from "drizzle-orm/pg-core";

/** Postgres enums. Values are stable identifiers; labels live in i18n. See docs/architecture/data-model.md. */
export const localeEnum = pgEnum("locale", ["en", "fr"]);

export const productTypeEnum = pgEnum("product_type", [
  "cake",
  "cupcake_box",
  "dessert",
  "seasonal",
]);

export const productStatusEnum = pgEnum("product_status", [
  "available",
  "sold_out",
  "hidden",
]);

export const optionKindEnum = pgEnum("option_kind", [
  "single",
  "multiple",
  "text",
  "quantity",
]);

export const promoPlacementEnum = pgEnum("promo_placement", ["banner", "card", "both"]);

export const promoLinkEnum = pgEnum("promo_link", [
  "none",
  "product",
  "category",
  "custom_request",
]);

export const discountKindEnum = pgEnum("discount_kind", ["percent", "sale_price"]);

export const adminRoleEnum = pgEnum("admin_role", ["owner", "admin"]);

/** `workshop`: a workshop registration (E-15, ADR-0005); its event is in `workshop_registration`. */
export const orderSourceEnum = pgEnum("order_source", ["website", "custom_request", "manual", "workshop"]);

/** Order lifecycle (PRD Appendix B). Transitions are enforced in app/domain/status.ts. */
export const orderStatusEnum = pgEnum("order_status", [
  "awaiting_payment",
  "pending_approval",
  "quote_needed",
  "quote_sent",
  "approved",
  "in_preparation",
  "ready_for_pickup",
  "out_for_delivery",
  "completed",
  "declined",
  "cancelled",
  "closed",
]);

export const fulfilmentEnum = pgEnum("fulfilment", ["delivery", "pickup"]);

export const actorTypeEnum = pgEnum("actor_type", ["admin", "customer", "system"]);

export const emailStatusEnum = pgEnum("email_status", ["pending", "sent", "dead"]);
