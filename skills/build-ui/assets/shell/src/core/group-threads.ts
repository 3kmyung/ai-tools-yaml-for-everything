export type Recency = "today" | "lastWeek" | "older";

export interface ThreadGroup<Item> {
  recency: Recency;
  threads: Item[];
}

const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;

function startOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function recencyOf(updatedAt: number, todayStart: number): Recency {
  if (updatedAt >= todayStart) return "today";
  if (updatedAt >= todayStart - 6 * DAY_MILLISECONDS) return "lastWeek";
  return "older";
}

export function groupThreadsByRecency<Item extends { updatedAt: number }>(threads: readonly Item[], now: number): ThreadGroup<Item>[] {
  const todayStart = startOfDay(now);
  const sorted = [...threads].sort((first, second) => second.updatedAt - first.updatedAt);
  const groups: ThreadGroup<Item>[] = [];
  for (const thread of sorted) {
    const recency = recencyOf(thread.updatedAt, todayStart);
    const lastGroup = groups.at(-1);
    if (lastGroup?.recency === recency) {
      lastGroup.threads.push(thread);
    } else {
      groups.push({ recency, threads: [thread] });
    }
  }
  return groups;
}
