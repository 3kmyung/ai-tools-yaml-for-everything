import { Circle, Play, Square } from "lucide-react";
import type { Draft, DraftShape } from "../../src/core/draft";
import type { RunRequest } from "../../src/core/messages";
import type { WorkflowChoice } from "../../src/core/release";

export const WORKFLOWS: readonly WorkflowChoice[] = [
  {
    id: "alpha",
    label: { en: "Alpha", ko: "알파", zh: "阿尔法" },
    description: { en: "Runs the first workflow", ko: "첫 번째 워크플로를 실행해요", zh: "运行第一个工作流" },
    icon: Play,
    steps: [
      { job: "read", label: { en: "Read", ko: "읽기", zh: "读取" } },
      { job: "write", label: { en: "Write", ko: "쓰기", zh: "写入" } },
    ],
  },
  { id: "beta", label: { en: "Beta", ko: "베타", zh: "贝塔" }, description: { en: "Runs the second workflow", ko: "두 번째 워크플로를 실행해요", zh: "运行第二个工作流" }, icon: Play },
];

export const TEXT_MISSING = { en: "Write the text", ko: "내용을 적어 주세요", zh: "请填写内容" };

export const SOURCE_MISSING = { en: "Upload a file", ko: "파일을 올려 주세요", zh: "请上传文件" };

export const SHAPE: DraftShape = {
  workflows: WORKFLOWS,
  prompts: [
    {
      field: "text",
      placeholder: { en: "Type the text to send", ko: "보낼 내용을 적어 주세요", zh: "请填写要发送的内容" },
      missing: TEXT_MISSING,
      workflows: ["alpha"],
    },
  ],
  files: [
    {
      field: "source",
      label: { en: "Upload file", ko: "파일 올리기", zh: "上传文件" },
      hint: { en: "The file to send", ko: "보낼 파일이에요", zh: "要发送的文件" },
      accept: "*/*",
      missing: SOURCE_MISSING,
      workflows: ["beta"],
    },
  ],
  options: [
    {
      field: "mode",
      label: { en: "Mode", ko: "모드", zh: "模式" },
      icon: Square,
      defaultValue: 2,
      choices: [
        { value: 1, label: { en: "First", ko: "첫째", zh: "第一" } },
        { value: 2, label: { en: "Second", ko: "둘째", zh: "第二" } },
      ],
      workflows: ["beta"],
    },
    {
      field: "level",
      label: { en: "Level", ko: "단계", zh: "级别" },
      icon: Circle,
      defaultValue: "low",
      choices: [
        { value: "low", label: { en: "Low", ko: "낮음", zh: "低" } },
        { value: "high", label: { en: "High", ko: "높음", zh: "高" } },
      ],
    },
  ],
};

export const OPTIONAL_PROMPT_SHAPE: DraftShape = {
  ...SHAPE,
  prompts: [
    {
      field: "note",
      placeholder: { en: "Add a note if you like", ko: "덧붙일 말이 있으면 적어 주세요", zh: "如需要，请填写备注" },
      optional: true,
      workflows: ["beta"],
    },
  ],
};

export const STYLE_MISSING = { en: "Describe the style first", ko: "분위기를 먼저 적어 주세요", zh: "请先描述风格" };

export const TWO_PROMPT_SHAPE: DraftShape = {
  ...SHAPE,
  prompts: [
    {
      field: "style",
      placeholder: { en: "Describe the style", ko: "분위기를 적어 주세요", zh: "请描述风格" },
      missing: STYLE_MISSING,
    },
    {
      field: "text",
      placeholder: { en: "Type the text to send", ko: "보낼 내용을 적어 주세요", zh: "请填写要发送的内容" },
      missing: TEXT_MISSING,
    },
  ],
};

export function draftOf(patch: Partial<Draft>): Draft {
  return { workflowId: "alpha", texts: {}, files: {}, options: { mode: 2, level: "low" }, ...patch };
}

export function requestOf(patch: Partial<RunRequest>): RunRequest {
  return { workflowId: "alpha", texts: {}, files: {}, options: {}, ...patch };
}
