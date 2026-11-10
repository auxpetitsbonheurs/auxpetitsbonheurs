// The one seam between the app and Supabase Auth (architecture "Auth"). Routes and
// guards talk to this interface; workers/app.ts puts the Supabase-backed gateway for
// the current request in the context, unit tests put an in-process fake.
import { createContext } from "react-router";

export interface AuthClaims {
  userId: string;
  /** Sign-in time from the JWT `amr` claim; refreshes keep it, so it measures session age. */
  signedInAt: Date;
}

/** Auth for ONE request: reads its cookies, collects the cookies to set on its response. */
export interface AuthGateway {
  /** Creates a session (cookies) for valid credentials; `null` for any refusal. */
  signInWithPassword(credentials: { email: string; password: string }): Promise<{ userId: string } | null>;
  /** Verified claims of the request's session (refreshing it when due), or `null`. Memoised per request. */
  claims(): Promise<AuthClaims | null>;
  /** Ends this device's session and clears its cookies. */
  signOut(): Promise<void>;
  /** Set-Cookie values produced so far that are not yet on a response; returns each once. */
  takeSetCookies(): string[];
}

export const authContext = createContext<AuthGateway>();
