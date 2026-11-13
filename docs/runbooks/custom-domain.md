# Moving the site to its own domain (S-224, S-236 AC5)

The site launches on the free Cloudflare address `https://auxpetitsbonheurs.<subdomain>.workers.dev`
(PRD 12.6). **The code holds no site address.** Every absolute URL is built from the address the
request arrived on, so adding a domain later is configuration only, no code change and no deploy:

| What | Where the address comes from |
|---|---|
| Canonical URLs, `og:url`, share images (`og:image`), `hreflang` alternates | root loader `url.origin` → `app/lib/seo.ts`, `app/root.tsx` |
| `/sitemap.xml` and the `Sitemap:` line of `/robots.txt` | `url.origin` (`app/routes/hooks/sitemap.ts`, `robots.ts`) |
| Links in sign-in and reset emails | the Send Email hook's own request URL (`app/routes/hooks/send-email.ts`) |
| Links in order emails (tracking) | E-10 is building these (not on main on 2026-11-13). Rule for that work: take the origin from the request that placed or changed the order (or a stored origin), never a hard-coded address |
| Staging `noindex` | the environment (`APP_ENV`), not the address |

What does depend on the address lives in the vendors' settings, listed below. Share previews of
links already posted on WhatsApp keep the old address (WhatsApp caches them); the old address keeps
working, so those links still open.

## Steps for the Owner (about 30 minutes plus DNS waiting time)

Buy the domain first (any registrar; put it in the bakery's name, auto-renew on, the bakery's card).
Below, `<domain>` is for example `auxpetitsbonheurs.mu`.

1. Cloudflare → Websites → Add a site → `<domain>` → Free plan → follow the steps to change the
   domain's name servers at the registrar (the registrar's DNS page). Wait until Cloudflare shows "Active".
2. Cloudflare → Workers & Pages → `auxpetitsbonheurs` → Settings → Domains & Routes → Add → Custom
   domain → `<domain>` (and again `www.<domain>` if wanted) → Add.
3. Supabase (production project) → Authentication → URL Configuration → Site URL → `https://<domain>`;
   Redirect URLs → Add `https://<domain>/auth/confirm` → Save. Keep the workers.dev entry for a week,
   then delete it.
4. Supabase → Authentication → Hooks → Send Email hook → URL → `https://<domain>/hooks/send-email` → Save.
5. Resend → Domains → Add domain → `mail.<domain>` → copy the DNS records it shows into Cloudflare →
   DNS → Records → Add record (one per line) → back in Resend press Verify.
6. Cloudflare → Workers & Pages → `auxpetitsbonheurs` → Settings → Variables and Secrets → `EMAIL_FROM`
   → `Aux petits bonheurs <orders@mail.<domain>>` → Deploy.
7. Cloudflare → Turnstile → the `apb-production` widget → Hostname management → Add `<domain>` → Save.
8. GitHub → repository → Settings → Secrets and variables → Actions → Variables → `PRODUCTION_URL` →
   `https://<domain>` → Update.
9. Open `https://<domain>/healthz` (expect `"ok":true`), then `https://<domain>/sitemap.xml`: every
   address in it starts with `https://<domain>`.
10. Optional, to send search engines to the new address: Cloudflare → Rules → Redirect Rules → Create
    → "Redirect from WWW to root" style rule, or a rule "Hostname equals
    `auxpetitsbonheurs.<subdomain>.workers.dev`" → Dynamic redirect to `concat("https://<domain>",
    http.request.uri.path)` → 301. (workers.dev hosts accept such a rule only on some accounts; if
    not offered, leave the old address working: it is `noindex`-free but canonical tags already
    point at the new domain once it is used.)

Nothing in the repository changes. If a builder is still involved, they may update the domain
examples in `docs/runbooks/deploy-keys.md` and the README.
