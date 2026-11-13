// The Content-Security-Policy nonce of this response (S-228 AC7), set by workers/app.ts, which also
// writes the header (workers/security-headers.ts). entry.server gives it to React, React Router's
// <Scripts> and the deferred-hydration loader. Undefined (tests, dev): scripts carry no nonce.
import { createContext } from "react-router";

export const cspNonceContext = createContext<string | undefined>(undefined);
