ALTER TABLE "settings" ADD COLUMN "facebook_url" text;
-- S-283: the bakery's Facebook page, shown as a footer icon. Optional (null = no icon), https on
-- facebook.com or fb.com, checked by the Settings save and again when read for the footer. Additive.
