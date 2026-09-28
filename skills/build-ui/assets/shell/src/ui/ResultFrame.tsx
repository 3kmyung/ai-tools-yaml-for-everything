import { FileJson } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import type { ReplyMeta } from "../core/release";
import { useLocale } from "../i18n/locale-context";
import { formatRunTime } from "../lib/format-time";
import { Card } from "./Card";
import { IconLink } from "./IconLink";
import { useBlobUrl } from "./use-blob-url";

interface ResultFrameProps {
  meta: ReplyMeta;
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

const JSON_MIME = "application/json";

function OutputsLink({ meta }: { meta: ReplyMeta }) {
  const { strings } = useLocale();
  const blob = useMemo(() => new Blob([JSON.stringify(meta.outputs, null, 2)], { type: JSON_MIME }), [meta.outputs]);
  const url = useBlobUrl(blob);
  if (!url) return null;
  return (
    <IconLink size="sm" label={strings.result.saveJson} href={url} download={`${meta.downloadName}.json`}>
      <FileJson aria-hidden className="size-3.5" />
    </IconLink>
  );
}

export function ResultFrame({ meta, header, footer, children }: ResultFrameProps) {
  const { locale } = useLocale();
  return (
    <Card
      data-reply="result"
      header={header}
      footer={footer}
      closing={
        <div className="mt-3 flex items-center justify-between gap-2">
          <p className="text-caption text-ink-tertiary">{formatRunTime(meta.elapsedMilliseconds, locale)}</p>
          <OutputsLink meta={meta} />
        </div>
      }
    >
      {children}
    </Card>
  );
}
