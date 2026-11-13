// The promotion editor's optional photo (S-053 AC8): the Settings image field with the
// `promotions` upload scope, so it follows the product photo rules (checked, compressed in the
// browser, 480/960 copies, S-047, S-276). Its own chunk, loaded lazily by the editor route
// (NFR-001 JS budget, as the product editor's option groups).
import { useCallback, useRef, useState } from "react";
import { useI18n } from "~/i18n/react";
import { type ImageState, SiteImageField } from "./site-image-field";

interface Props {
  path: string | null;
  url: string | null;
  error?: string;
  onState: (state: ImageState) => void;
}

export function PromotionImage({ path, url, error, onState }: Props) {
  const { t } = useI18n();
  // One upload session per editor view, made on the first photo (a random id on the server would not hydrate).
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
      <SiteImageField
        id="promotion-image"
        name="imagePath"
        scope="promotions"
        label={t("admin.promotions.imageLabel")}
        hint={t("admin.promotions.imageHint")}
        path={path}
        url={url}
        error={error}
        sessionId={sessionId}
        onChange={onState}
      />
    </>
  );
}

export default PromotionImage;
