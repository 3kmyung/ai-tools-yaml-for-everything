import { Play } from "lucide-react";
import { defineRelease, type Localized, type ResultProps } from "../core/release";
import { ResultFrame } from "../ui/ResultFrame";

const RESULT_CARD_MISSING: Localized = {
  en: "The result card is not built yet",
  ko: "결과 카드를 아직 만들지 않았어요",
  zh: "结果卡片还没有做好",
};

function ResultCard({ meta, pick }: ResultProps<unknown>) {
  return (
    <ResultFrame meta={meta}>
      <p className="text-body text-ink-secondary">{pick(RESULT_CARD_MISSING)}</p>
    </ResultFrame>
  );
}

export const release = defineRelease<unknown>({
  id: "release",
  name: { en: "Release", ko: "Release", zh: "Release" },
  eyebrow: { en: "model-compose", ko: "model-compose", zh: "model-compose" },
  headline: [
    {
      en: "What should we run?",
      ko: "무엇을 실행할까요?",
      zh: "要运行什么？",
    },
  ],
  caption: {
    en: "Runs on a model-compose server",
    ko: "model-compose 서버에서 실행돼요",
    zh: "在 model-compose 服务器上运行",
  },
  controller: { port: 8080, basePath: "/api" },
  workflows: [
    {
      id: "__default__",
      label: {
        en: "Run",
        ko: "실행",
        zh: "运行",
      },
      description: {
        en: "Runs the default workflow",
        ko: "기본 워크플로를 실행해요",
        zh: "运行默认工作流",
      },
      icon: Play,
    },
  ],
  readResult: (outputs) => outputs,
  ResultCard,
  downloadName: () => "result",
});
