import { data } from "react-router";
import { adminMiddleware } from "~/server/admin-page.server";
import { actionError } from "~/server/action-result.server";
import { requireAdmin } from "~/server/auth.server";
import { uploadContext } from "~/server/storage.server";
import { parseUploadRequest, requestUploadUrls } from "~/server/services/upload-urls.server";
import type { Route } from "./+types/uploads";

/**
 * `admin/uploads` (POST /admin/uploads, contracts.md `requestUploadUrls`, S-047 AC11): signed
 * upload URLs for photos the browser has already compressed. A resource route answering
 * JSON, so the editor (and later gallery and promotions) can call it from an upload queue.
 * Admin session required (a customer gets FORBIDDEN, anonymous the login redirect); no
 * Turnstile. Every response is `private, no-store` and noindex (admin middleware).
 */
export const middleware: Route.MiddlewareFunction[] = adminMiddleware;

/** Nothing to read here: 404 after the guard. */
export async function loader(args: Route.LoaderArgs) {
  await requireAdmin(args);
  throw data(null, { status: 404 });
}

type Envelope = { data: unknown; init: ResponseInit | null };
const isEnvelope = (value: unknown): value is Envelope => typeof value === "object" && value !== null && (value as { type?: unknown }).type === "DataWithResponseInit";

/** A resource route answers a real Response: the envelope (or a thrown guard refusal) as JSON. */
function asJson(value: unknown): Response {
  if (value instanceof Response) return value;
  if (isEnvelope(value)) return Response.json(value.data, value.init ?? {});
  return Response.json(value);
}

/** `{ uploadSessionId, type[], size[] }` → `{ ok, uploads: { path, signedUrl, token }[] }` or the error envelope. */
export async function action(args: Route.ActionArgs) {
  let me;
  try {
    me = await requireAdmin(args);
  } catch (refusal) {
    // Anonymous: the login redirect (a Response); customer: FORBIDDEN as JSON. Thrown, as
    // every guard refusal is: a resource route passes a thrown Response through as it is.
    if (refusal instanceof Response || isEnvelope(refusal)) throw asJson(refusal);
    throw refusal;
  }
  const request = parseUploadRequest(await args.request.formData());
  if (!request) return asJson(actionError("VALIDATION_FAILED", me.locale));
  // Site images belong to Owner-only Settings (S-059 AC8): an Admin gets FORBIDDEN. Brand page
  // photos (`page:<key>`, E-13 S-247) are page content: Admins and Owners alike.
  if (request.scope === "site" && me.role !== "owner") return asJson(actionError("FORBIDDEN", me.locale));
  const result = await requestUploadUrls(args.context.get(uploadContext), me.id, request);
  if (!result.ok) return asJson(actionError(result.code, me.locale));
  return asJson({ ok: true, uploads: result.uploads });
}
