// Every unit test starts with an empty per-isolate Settings cache (each test has its own database).
import { beforeEach } from "vitest";
import { siteSettingsCache } from "~/server/repos/settings.server";

beforeEach(() => {
  siteSettingsCache.clear();
});
