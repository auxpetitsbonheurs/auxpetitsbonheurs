// Public (non-secret) configuration loaders need, set per request by workers/app.ts.
import { createContext } from "react-router";

export interface PublicConfig {
  /** Base of public Storage URLs (product, gallery and promotion photos). */
  supabaseUrl: string;
}

export const publicConfigContext = createContext<PublicConfig>({ supabaseUrl: "" });
