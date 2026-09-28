import { useCallback, useState } from "react";
import { clearSentDraft, createDraft, type Draft, type DraftShape } from "../../core/draft";
import type { InputValue } from "../../core/messages";

export interface DraftControls {
  draft: Draft;
  selectWorkflow: (workflowId: string) => void;
  setText: (field: string, text: string) => void;
  setFile: (field: string, file: File | null) => void;
  setOption: (field: string, value: InputValue) => void;
  clearSent: () => void;
}

export function useDraft(shape: DraftShape): DraftControls {
  const [draft, setDraft] = useState<Draft>(() => createDraft(shape));

  const selectWorkflow = useCallback((workflowId: string) => setDraft((current) => ({ ...current, workflowId })), []);
  const setText = useCallback((field: string, text: string) => {
    setDraft((current) => ({ ...current, texts: { ...current.texts, [field]: text } }));
  }, []);
  const setFile = useCallback((field: string, file: File | null) => {
    setDraft((current) => ({ ...current, files: { ...current.files, [field]: file } }));
  }, []);
  const setOption = useCallback((field: string, value: InputValue) => {
    setDraft((current) => ({ ...current, options: { ...current.options, [field]: value } }));
  }, []);
  const clearSent = useCallback(() => setDraft(clearSentDraft), []);

  return { draft, selectWorkflow, setText, setFile, setOption, clearSent };
}
