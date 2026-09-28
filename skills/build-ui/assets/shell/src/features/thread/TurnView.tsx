import type { PendingRun, Turn } from "../../core/conversation";
import type { ResultMessage, UserMessage } from "../../core/messages";
import type { PlaybackFocus, Release } from "../../core/release";
import { useLocale } from "../../i18n/locale-context";
import { ErrorCard } from "./ErrorCard";
import { PendingCard } from "./PendingCard";
import { UserBubble } from "./UserBubble";

interface TurnViewProps {
  release: Release;
  turn: Turn;
  pending: PendingRun | null;
  canRetry: boolean;
  playback: PlaybackFocus;
  onRetry: (prompt: UserMessage) => void;
}

function ResultReply({ release, prompt, reply, playback }: { release: Release; prompt: UserMessage; reply: ResultMessage; playback: PlaybackFocus }) {
  const { locale, pick } = useLocale();
  const meta = {
    replyId: reply.id,
    elapsedMilliseconds: reply.elapsedMilliseconds,
    outputs: reply.outputs,
    downloadName: release.downloadName(prompt.request),
  };
  return <>{release.renderResult({ result: reply.result, request: prompt.request, meta, playback, locale, pick })}</>;
}

function ReplyView({ release, turn, pending, canRetry, playback, onRetry }: TurnViewProps) {
  const retry = () => onRetry(turn.prompt);

  if (turn.status === "pending" && pending) return <PendingCard release={release} pending={pending} />;
  if (turn.status === "unanswered") {
    return <ErrorCard reason="unanswered" detail="" rules={release.failures} canRetry={canRetry} onRetry={retry} />;
  }
  if (turn.reply?.kind === "result") return <ResultReply release={release} prompt={turn.prompt} reply={turn.reply} playback={playback} />;
  if (turn.reply?.kind === "error") {
    return <ErrorCard reason={turn.reply.reason} detail={turn.reply.detail} rules={release.failures} canRetry={canRetry} onRetry={retry} />;
  }
  return null;
}

export function TurnView(props: TurnViewProps) {
  return (
    <section data-turn className="flex flex-col gap-4">
      <UserBubble release={props.release} message={props.turn.prompt} />
      <ReplyView {...props} />
    </section>
  );
}
