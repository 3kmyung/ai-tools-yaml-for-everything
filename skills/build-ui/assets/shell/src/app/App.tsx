import type { Release } from "../core/release";
import { Sidebar } from "../features/sidebar/Sidebar";
import { LocaleContext } from "../i18n/locale-context";
import { TopBar } from "./TopBar";
import { useAppController } from "./use-app-controller";
import { useLocaleState } from "./use-locale-state";
import { Workspace } from "./Workspace";

function Shell({ release }: { release: Release }) {
  const { sidebar, topBar, workspace } = useAppController(release);

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas text-ink">
      <Sidebar {...sidebar} />
      <main className="relative flex min-w-0 flex-1 flex-col">
        <TopBar {...topBar} />
        <Workspace {...workspace} />
      </main>
    </div>
  );
}

export function App({ release }: { release: Release }) {
  const locale = useLocaleState();

  return (
    <LocaleContext value={locale}>
      <Shell release={release} />
    </LocaleContext>
  );
}
