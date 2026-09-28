import type { Message, Reply, UserMessage } from "./messages";
import type { StepStates } from "./run-steps";

export interface PendingRun {
  promptId: string;
  workflowId: string;
  startedAt: number;
  steps: StepStates;
  isStopping: boolean;
}

export type TurnStatus = "answered" | "pending" | "unanswered";

export interface Turn {
  prompt: UserMessage;
  reply: Reply | null;
  status: TurnStatus;
}

function latestReplies(messages: readonly Message[]): Map<string, Reply> {
  const replies = new Map<string, Reply>();
  for (const message of messages) {
    if (message.kind === "user") continue;
    const current = replies.get(message.replyTo);
    if (!current || current.createdAt <= message.createdAt) replies.set(message.replyTo, message);
  }
  return replies;
}

function statusOf(prompt: UserMessage, reply: Reply | null, pendingPromptId: string | null): TurnStatus {
  if (prompt.id === pendingPromptId) return "pending";
  return reply ? "answered" : "unanswered";
}

export function buildTurns(messages: readonly Message[], pendingPromptId: string | null): Turn[] {
  const replies = latestReplies(messages);
  return messages
    .filter((message): message is UserMessage => message.kind === "user")
    .map((prompt) => {
      const reply = replies.get(prompt.id) ?? null;
      return { prompt, reply, status: statusOf(prompt, reply, pendingPromptId) };
    });
}
