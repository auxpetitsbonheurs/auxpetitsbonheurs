// Route middleware of the invitation page (S-029): the page speaks the invitation's
// language (AC10), not the visitor's browser, and the token in the path never leaves in a
// Referer header. A malformed token is never looked up (AC7).
import type { MiddlewareFunction } from "react-router";
import { adminLocaleContext } from "~/server/admin-page.server";
import { clockContext } from "~/server/clock.server";
import { requestDbContext } from "~/server/db.server";
import { isInvitationToken } from "~/server/invite-token.server";
import { responseHeaders } from "~/server/response-headers.server";
import { findOpenInvitation } from "~/server/services/accept-invite.server";

export const invitationLocale: MiddlewareFunction<Response> = async (args, next) => {
  const token = args.params.token;
  if (isInvitationToken(token)) {
    const invitation = await findOpenInvitation(args.context.get(requestDbContext).db, token, args.context.get(clockContext).now());
    if (invitation) args.context.set(adminLocaleContext, invitation.locale);
  }
  return next();
};

export const invitationNoReferrer = responseHeaders({ "Referrer-Policy": "no-referrer" });
