// The workshop editor's optional photo (E-15 S-301 AC2): the Settings image field with the
// `workshops` upload scope, so it follows the product photo rules (checked, compressed in the
// browser, 480/960 copies). Its own chunk, loaded lazily by the editor route (NFR-001).
import { useCallback, useRef, useState } from "react";
import { type ImageState, SiteImageField } from "~/components/admin/site-image-field";
import { useI18n } from "~/i18n/react";

interface Props {
  path: string | null;
  url: string | null;
  error?: string;
  onState: (state: ImageState) => void;
}

export function WorkshopEventPhoto({ path, url, error, onState }: Props) {
  const { t } = useI18n();
  const [session, setSession] = useState<string | null>(null);
  const sessionRef = useRef<string | null>(null);
  const sessionId = useCallback(() => {
    if (!sessionRef.current) {
      sessionRef.current = crypto.randomUUID();
      setSession(sessionRef.current);
    }
    return sessionRef.current;
  }, []);
  return (
    <>
      <input type="hidden" name="uploadSessionId" value={session ?? ""} />
      <SiteImageField id="workshop-photo" name="photoPath" scope="workshops" label={t("admin.workshops.photo")} hint={t("admin.workshops.photoHint")} path={path} url={url} error={error} sessionId={sessionId} onChange={onState} />
    </>
  );
}

export default WorkshopEventPhoto;
