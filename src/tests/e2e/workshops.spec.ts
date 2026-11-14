// E-15 workshops, end to end (S-301 AC6, S-302 AC4, S-303 AC6, AC7, S-308 AC3): an Admin creates
// and publishes a workshop from More; a customer finds it on /workshops, registers 2 cakes with
// allergies on its page and lands on the confirmation; the Admin sees the registration with its
// allergy badge, accepts it and marks it paid. Each test uses its own workshop on a day in
// 2041-2050, so specs running in parallel never share places. axe, tap targets and no
// horizontal scroll on every screen; 375 px screenshots go to the job's scratchpad.
import { randomInt } from "node:crypto";
import type postgres from "postgres";
import { expectNoA11yViolations, expectNoHorizontalScroll, expectTapTargets, withZoom } from "./support/a11y";
import { createE2eAdmin, signIn } from "./support/admin";
import { E2E_ACCOUNTS } from "./support/auth-users";
import { type Page, expect, test } from "./support/fixtures";

const SHOTS = process.env.WORKSHOP_SHOTS_DIR;

async function shot(page: Page, name: string) {
  if (!SHOTS || test.info().project.name !== "phone-375") return;
  await page.screenshot({ path: `${SHOTS}/workshops-${name}.png`, fullPage: true });
}

async function hydrated(page: Page) {
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
}

function ownDay(): string {
  return new Date(Date.UTC(2041, 0, 1) + randomInt(0, 3600) * 86_400_000).toISOString().slice(0, 10);
}

/** A published workshop straight in the database (for the customer-side tests). */
async function publishedWorkshop(db: postgres.Sql, capacity = 10, title = `Valentine's workshop ${randomInt(1e6)}`) {
  const slug = `ws-${randomInt(1e9)}`;
  await db`insert into workshop_event (slug, title_en, title_fr, description_en, event_on, starts_at, ends_at, address, price_rs, capacity, cake_options, status)
    values (${slug}, ${title}, ${`Atelier ${title}`}, 'Ten couples decorate a cake together.', ${ownDay()}, '14:00', '16:30', '12 Rue Example, Beau Bassin', 1500, ${capacity},
      ${db.json([{ id: "choc", name: { en: "Chocolate", fr: "Chocolat" } }, { id: "rv", name: { en: "Red velvet" } }])}, 'published')`;
  return { slug, title };
}

test.describe("E-15 workshops", () => {
  test("an Admin creates and publishes a workshop from More; it is listed on /workshops", async ({ page, db }) => {
    const admin = await createE2eAdmin(db, { role: "admin" });
    const title = `Mother's Day cupcakes ${randomInt(1e6)}`;
    await signIn(page, admin, "/admin/more");
    await hydrated(page);
    await page.getByRole("link", { name: "Workshops" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Workshops" })).toBeVisible();
    await page.getByRole("link", { name: "New workshop" }).click();
    await hydrated(page);
    await page.getByLabel("Title (English)").fill(title);
    await page.getByLabel(/^Description \(English\)/).fill("Six cupcakes to decorate with your child.");
    await page.getByLabel("Date", { exact: true }).fill(ownDay());
    await page.getByLabel("Start", { exact: true }).fill("10:00");
    await page.getByLabel("End", { exact: true }).fill("12:00");
    await page.getByLabel("Address", { exact: true }).fill("12 Rue Example, Beau Bassin");
    await page.getByLabel("Price per cake (Rs)").fill("1200");
    await page.getByLabel("Number of cakes").fill("8");
    await page.getByLabel("Cake 1 (English)").fill("Vanilla");
    await page.getByRole("button", { name: "Add a cake option" }).click();
    await page.getByLabel("Cake 2 (English)").fill("Chocolate");
    await expectNoA11yViolations(page);
    await expectNoHorizontalScroll(page);
    await shot(page, "admin-event-editor");
    await page.getByRole("button", { name: "Save workshop" }).click();
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.getByText("Status: Draft")).toBeVisible();
    await page.getByRole("button", { name: "Publish" }).click();
    await expect(page.getByText("Status: Published")).toBeVisible();
    await expectTapTargets(page);

    await page.goto("/workshops");
    const card = page.getByRole("listitem").filter({ hasText: title });
    await expect(card.getByText("Rs 1,200 per cake · up to 2 people per cake")).toBeVisible();
    await expect(card.getByText("8 places left")).toBeVisible();
  });

  test("a customer registers 2 cakes with allergies; the Admin sees the badge, accepts and marks it paid", async ({ page, db, browser, baseURL }) => {
    const { slug, title } = await publishedWorkshop(db);
    await page.goto("/workshops");
    await expect(page.getByRole("heading", { level: 2, name: "Upcoming workshops" })).toBeVisible();
    await expectNoA11yViolations(page);
    await expectNoHorizontalScroll(page);
    await shot(page, "customer-list");
    await page.getByRole("link", { name: `${title}: See the workshop and register` }).click();

    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await hydrated(page);
    await page.getByLabel("Number of cakes").selectOption("2");
    await page.getByLabel("Cake 1", { exact: true }).selectOption({ label: "Chocolate" });
    await page.getByLabel("Cake 2", { exact: true }).selectOption({ label: "Red velvet" });
    await expect(page.getByText("Total: Rs 3,000")).toBeVisible();
    await page.getByLabel("Names of the people coming").fill("Aisha and Ravi");
    await page.getByLabel("Yes, please describe").check();
    await page.getByLabel("Describe the allergies or dietary needs").fill("Peanuts for Ravi");
    await page.getByLabel("Name", { exact: true }).fill("Aisha Test");
    await page.getByLabel("Phone", { exact: true }).fill("5712 3456");
    await page.getByLabel("Email", { exact: true }).fill(`aisha-${randomInt(1e9)}@example.com`);
    await expect(page.getByRole("link", { name: "privacy note" })).toBeVisible();
    await expectNoA11yViolations(page);
    await expectNoHorizontalScroll(page);
    await expectTapTargets(page);
    await shot(page, "event-form");
    await page.getByRole("button", { name: "Register" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Thank you, we received your registration" })).toBeVisible();
    await expect(page.getByText("Your place is held while we look at your registration")).toBeVisible();

    // The seeded Owner: a second owner row would break the one-Owner invariant other specs read.
    const admin = E2E_ACCOUNTS.owner;
    const context = await browser.newContext({ baseURL, viewport: page.viewportSize() ?? undefined });
    const owner = await context.newPage();
    const [event] = await db<{ id: string }[]>`select id from workshop_event where slug = ${slug}`;
    await signIn(owner, admin, `/admin/workshops/${event!.id}`);
    await hydrated(owner);
    await expect(owner.getByRole("heading", { level: 2, name: "1 registration" })).toBeVisible();
    await expect(owner.getByText("Peanuts for Ravi")).toBeVisible();
    await expect(owner.getByText("Chocolate: 1 cake")).toBeVisible();
    await expectNoA11yViolations(owner);
    await expectNoHorizontalScroll(owner);
    await shot(owner, "admin-registrations");

    await owner.getByRole("link", { name: /^Registration APB-\d+ by Aisha Test$/ }).click();
    await hydrated(owner);
    await expect(owner.getByText("Peanuts for Ravi")).toBeVisible();
    await owner.getByRole("button", { name: /^Accept APB-\d+$/ }).click();
    await expect(owner.getByTestId("approve-result")).toContainText("approved");
    await owner.getByRole("button", { name: "Payment received" }).click();
    await owner.getByRole("button", { name: "Yes, payment received" }).click();
    await expect(owner.getByRole("button", { name: /^Undo payment received for/ })).toBeVisible();
    await context.close();
  });

  test("tidy: the Owner moves the start time; the registrant is emailed and a WhatsApp link with the change appears", async ({ page, db }) => {
    const { slug, title } = await publishedWorkshop(db);
    const email = `moved-${randomInt(1e9)}@example.com`;
    await page.goto(`/workshops/${slug}`);
    await hydrated(page);
    await page.getByLabel("Cake 1", { exact: true }).selectOption({ label: "Chocolate" });
    await page.getByLabel("None", { exact: true }).check();
    await page.getByLabel("Name", { exact: true }).fill("Mia Test");
    await page.getByLabel("Phone", { exact: true }).fill("5712 3456");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByRole("button", { name: "Register" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Thank you, we received your registration" })).toBeVisible();

    const admin = await createE2eAdmin(db, { role: "owner" });
    const [event] = await db<{ id: string }[]>`select id from workshop_event where slug = ${slug}`;
    await signIn(page, admin, `/admin/workshops/${event!.id}`);
    await hydrated(page);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.getByRole("link", { name: "Tell Mia Test about the change on WhatsApp" })).toHaveCount(0);
    await page.getByLabel("Start", { exact: true }).fill("15:00");
    await page.getByLabel("End", { exact: true }).fill("17:30");
    await page.getByRole("button", { name: "Save workshop" }).click();

    await expect(page.getByText("Saved. 1 registrant was emailed about the change.")).toBeVisible();
    const whatsapp = page.getByRole("link", { name: "Tell Mia Test about the change on WhatsApp" });
    await expect(whatsapp).toBeVisible();
    await expect(whatsapp).toHaveAttribute("href", /^https:\/\/wa\.me\/23057123456\?text=.*15%3A00/);
    const mails = await db<{ payload: { previousStart?: string; previousEnd?: string } }[]>`select payload from email_outbox where template = 'workshop_changed' and to_email = ${email}`;
    expect(mails.map((m) => [m.payload.previousStart, m.payload.previousEnd])).toEqual([["14:00", "16:30"]]);
    await expectNoA11yViolations(page);
    await expectNoHorizontalScroll(page);
    await expectTapTargets(page);
    await shot(page, "admin-event-changed");
  });

  test("tidy (S-224): a published upcoming workshop is in the sitemap in both languages; a draft is not", async ({ request, db }) => {
    const { slug } = await publishedWorkshop(db);
    const draft = `ws-draft-${randomInt(1e9)}`;
    await db`insert into workshop_event (slug, title_en, event_on, starts_at, ends_at, address, price_rs, capacity, cake_options, status)
      values (${draft}, 'Draft', ${ownDay()}, '14:00', '16:30', '12 Rue Example', 1500, 4, ${db.json([{ id: "choc", name: { en: "Chocolate" } }])}, 'draft')`;

    const xml = await (await request.get("/sitemap.xml")).text();

    expect(xml).toMatch(new RegExp(`<loc>http[^<]+/workshops/${slug}</loc>`));
    expect(xml).toMatch(new RegExp(`<loc>http[^<]+/fr/workshops/${slug}</loc>`));
    expect(xml).not.toContain(draft);
  });

  test("the French page, the explicit allergies choice, and a full workshop", async ({ page, db }) => {
    const { slug, title } = await publishedWorkshop(db, 1);
    await page.goto(`/fr/workshops/${slug}`);
    await expect(page.getByRole("heading", { level: 1, name: `Atelier ${title}` })).toBeVisible();
    await hydrated(page);
    await page.getByLabel("Gâteau 1", { exact: true }).selectOption({ label: "Chocolat" });
    await page.getByLabel("Nom", { exact: true }).fill("Aisha Test");
    await page.getByLabel("Téléphone", { exact: true }).fill("5712 3456");
    await page.getByLabel("E-mail", { exact: true }).fill(`fr-${randomInt(1e9)}@example.com`);
    await page.getByRole("button", { name: "S'inscrire" }).click();
    const summary = page.getByRole("alert").filter({ hasText: "Choisissez Aucune, ou Oui et précisez." });
    await expect(summary).toBeFocused();
    await page.getByLabel("Aucune").check();
    await page.getByRole("button", { name: "S'inscrire" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Merci, nous avons reçu votre inscription" })).toBeVisible();

    await page.goto(`/workshops/${slug}`);
    // The language chosen on the French page is remembered, so the French page answers.
    await expect(page.getByRole("heading", { level: 2, name: "Cet atelier est complet" })).toBeVisible();
    await expect(page.getByRole("button", { name: "S'inscrire" })).toHaveCount(0);
  });

  test("a title with a long unbroken word wraps: no sideways scroll on the list or the event page at 200% zoom, in both languages", async ({ page, db }) => {
    // An Owner may paste a long word or link; parallel specs also publish titles like this one.
    const { slug } = await publishedWorkshop(db, 10, `Valentine's cake workshop Chocolatepassionfruitcelebration-${randomInt(1e9)}`);
    for (const url of ["/workshops", "/fr/workshops", `/workshops/${slug}`, `/fr/workshops/${slug}`]) {
      await page.goto(url);
      await hydrated(page);
      await expectNoHorizontalScroll(page);
      await withZoom(page, 2, async () => {
        await expectNoHorizontalScroll(page);
        await expectTapTargets(page);
      });
    }
  });
});
