import { describe, expect, it } from "vitest";
import { documentLanguageOf, isLocale, pickLocalized, resolveLocale } from "../../src/core/locale";

describe("resolveLocale", () => {
  it("takes a supported ?lang= value first", () => {
    expect(resolveLocale("?lang=zh", "ko", ["en-US"])).toBe("zh");
    expect(resolveLocale("?thread=1&lang=ko", null, ["zh-CN"])).toBe("ko");
  });

  it("ignores any other ?lang= value", () => {
    expect(resolveLocale("?lang=fr", "ko", ["en-US"])).toBe("ko");
    expect(resolveLocale("?lang=KO", null, ["zh-CN"])).toBe("zh");
    expect(resolveLocale("?lang=ko-KR", null, [])).toBe("en");
    expect(resolveLocale("?lang=", null, ["ko"])).toBe("ko");
  });

  it("lets ?lang= win over a stored choice on the next load", () => {
    expect(resolveLocale("?lang=en", "zh", ["ko-KR"])).toBe("en");
  });

  it("takes an exactly supported stored value next", () => {
    expect(resolveLocale("", "zh", ["ko-KR"])).toBe("zh");
    expect(resolveLocale("", "zh-CN", ["ko-KR"])).toBe("ko");
    expect(resolveLocale("", "", ["ko-KR"])).toBe("ko");
  });

  it("walks the browser languages in order by primary subtag", () => {
    expect(resolveLocale("", null, ["fr-FR", "ko-KR", "en-GB"])).toBe("ko");
    expect(resolveLocale("", null, ["en-GB", "ko"])).toBe("en");
    expect(["zh-CN", "zh-TW", "zh-Hant", "zh", "ZH-hk"].map((language) => resolveLocale("", null, [language]))).toEqual(["zh", "zh", "zh", "zh", "zh"]);
  });

  it("falls back to English", () => {
    expect(resolveLocale("", null, [])).toBe("en");
    expect(resolveLocale("", "de", ["fr-FR", "ja"])).toBe("en");
  });
});

describe("locale helpers", () => {
  it("recognizes only the supported codes", () => {
    expect([isLocale("en"), isLocale("ko"), isLocale("zh"), isLocale("zh-CN"), isLocale(null)]).toEqual([true, true, true, false, false]);
  });

  it("names the document language, Simplified for Chinese", () => {
    expect([documentLanguageOf("en"), documentLanguageOf("ko"), documentLanguageOf("zh")]).toEqual(["en", "ko", "zh-Hans"]);
  });

  it("picks the text for a locale", () => {
    expect(pickLocalized({ en: "Run", ko: "실행", zh: "运行" }, "zh")).toBe("运行");
  });
});
