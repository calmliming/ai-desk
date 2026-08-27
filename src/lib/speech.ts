/**
 * 语音输入：Web Speech API 的最小封装。
 * 支持 Chrome / Edge / Safari（webkitSpeechRecognition），Firefox 不支持。
 */

export interface SpeechResultItem {
  isFinal: boolean;
  length: number;
  [i: number]: { transcript: string };
}

export interface SpeechEvent {
  resultIndex: number;
  results: ArrayLike<SpeechResultItem>;
}

export interface Recognizer {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

type WindowWithSpeech = Window & {
  SpeechRecognition?: new () => Recognizer;
  webkitSpeechRecognition?: new () => Recognizer;
};

export function speechSupported(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as WindowWithSpeech;
  return typeof w.SpeechRecognition === "function" || typeof w.webkitSpeechRecognition === "function";
}

/** 创建识别器；不支持时返回 null。lang 默认简体中文，continuous 连续识别。 */
export function createRecognizer(lang = "zh-CN"): Recognizer | null {
  if (typeof window === "undefined") return null;
  const w = window as WindowWithSpeech;
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = lang;
  rec.continuous = true;
  rec.interimResults = true;
  return rec;
}

/** 识别错误码 → 用户可读文案 */
export function speechErrorText(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "未授予麦克风权限，请在浏览器地址栏允许访问麦克风";
    case "no-speech":
      return "没有检测到语音，请靠近麦克风再试";
    case "audio-capture":
      return "未找到麦克风设备";
    case "network":
      return "语音识别服务网络异常";
    case "aborted":
      return "语音识别已取消";
    default:
      return `语音识别出错（${code}）`;
  }
}
