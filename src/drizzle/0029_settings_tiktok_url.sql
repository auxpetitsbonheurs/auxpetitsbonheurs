ALTER TABLE "settings" ADD COLUMN "tiktok_url" text;
-- S-319: the bakery's TikTok account, shown as a footer icon. Optional (null = no icon), https on
-- tiktok.com or www.tiktok.com, checked by the Settings save and again when read for the footer. Additive.
