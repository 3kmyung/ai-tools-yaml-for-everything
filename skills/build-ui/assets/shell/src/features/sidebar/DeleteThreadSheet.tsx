import type { TitledThread } from "../../core/request-summary";
import { fillTemplate } from "../../i18n/dictionaries";
import { useLocale } from "../../i18n/locale-context";
import { Button } from "../../ui/Button";
import { Sheet } from "../../ui/Sheet";

interface DeleteThreadSheetProps {
  thread: TitledThread | null;
  onCancel: () => void;
  onConfirm: (threadId: string) => void;
}

export function DeleteThreadSheet({ thread, onCancel, onConfirm }: DeleteThreadSheetProps) {
  const { deleteSheet } = useLocale().strings;

  return (
    <Sheet
      isOpen={thread !== null}
      title={deleteSheet.title}
      description={thread ? fillTemplate(deleteSheet.description, { title: thread.title }) : undefined}
      onClose={onCancel}
    >
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel}>{deleteSheet.cancel}</Button>
        <Button variant="danger" onClick={() => thread && onConfirm(thread.id)}>
          {deleteSheet.confirm}
        </Button>
      </div>
    </Sheet>
  );
}
