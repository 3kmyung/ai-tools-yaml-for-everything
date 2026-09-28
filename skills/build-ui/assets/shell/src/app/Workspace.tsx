import type { ReactNode } from "react";
import { buildTurns, type PendingRun, type Turn } from "../core/conversation";
import type { Draft } from "../core/draft";
import type { Localized } from "../core/locale";
import type { Message, UserMessage } from "../core/messages";
import type { Release } from "../core/release";
import { Composer } from "../features/composer/Composer";
import type { DraftControls } from "../features/composer/use-draft";
import { WorkflowCards } from "../features/composer/WorkflowCards";
import { ThreadView } from "../features/thread/ThreadView";
import { useLocale } from "../i18n/locale-context";

interface WorkspaceProps {
  release: Release;
  activeThreadId: string | null;
  messages: readonly Message[];
  pending: PendingRun | null;
  isBusy: boolean;
  draftControls: DraftControls;
  onSubmit: (draft: Draft) => void;
  onStop: () => void;
  onRetry: (prompt: UserMessage) => void;
}

function Headline({ lines }: { lines: readonly Localized[] }) {
  const { pick } = useLocale();
  return (
    <h1 className="mt-2 font-display text-display leading-tight font-bold tracking-tight sm:text-display-lg">
      {lines.map((line, index) => (
        <span key={index} className="block">
          {pick(line)}
        </span>
      ))}
    </h1>
  );
}

function NewThreadLayout({ release, draftControls, composer }: Pick<WorkspaceProps, "release" | "draftControls"> & { composer: ReactNode }) {
  const { pick } = useLocale();
  const hasChoices = release.workflows.length >= 2;
  return (
    <div className="flex flex-1 flex-col items-center overflow-y-auto px-4 py-[6vh]">
      <div className="my-auto w-full max-w-content">
        <p className="text-label text-ink-tertiary">{pick(release.eyebrow)}</p>
        <Headline lines={release.headline} />
        {hasChoices && (
          <WorkflowCards
            className="mt-8"
            workflows={release.workflows}
            selectedId={draftControls.draft.workflowId}
            onSelect={draftControls.selectWorkflow}
          />
        )}
        <div className={hasChoices ? "mt-4" : "mt-8"}>{composer}</div>
      </div>
    </div>
  );
}

function ThreadLayout({ release, composer, turns, pending, isBusy, onRetry }: Pick<WorkspaceProps, "release" | "pending" | "isBusy" | "onRetry"> & { composer: ReactNode; turns: Turn[] }) {
  const { pick } = useLocale();
  return (
    <>
      <div className="flex-1 overflow-y-auto">
        <ThreadView release={release} turns={turns} pending={pending} canRetry={!isBusy} onRetry={onRetry} />
      </div>
      <div className="mx-auto w-full max-w-content px-4 pt-1 pb-3">
        {composer}
        <p className="mt-2 text-center text-caption text-ink-tertiary">{pick(release.caption)}</p>
      </div>
    </>
  );
}

export function Workspace({ release, activeThreadId, messages, pending, isBusy, draftControls, onSubmit, onStop, onRetry }: WorkspaceProps) {
  const turns = buildTurns(messages, pending?.promptId ?? null);
  const composer = (
    <Composer
      release={release}
      controls={draftControls}
      isBusy={isBusy}
      isStopping={pending?.isStopping ?? false}
      onSubmit={onSubmit}
      onStop={onStop}
    />
  );

  if (activeThreadId === null && turns.length === 0) {
    return <NewThreadLayout release={release} draftControls={draftControls} composer={composer} />;
  }
  return <ThreadLayout release={release} composer={composer} turns={turns} pending={pending} isBusy={isBusy} onRetry={onRetry} />;
}
