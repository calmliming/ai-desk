/** 文件导出：AI 回答 / 会话 → .md 或 .pptx（全部在浏览器端生成） */

import { downloadText } from "./session-export";
import { toast } from "./toast-store";

export interface SlideSection {
  title: string;
  bullets: string[];
}

const MAX_BULLETS_PER_SLIDE = 8;
const MAX_BULLET_CHARS = 160;

/** 提取第一个一级标题（用于文件名与 PPT 封面标题） */
export function firstHeading(markdown: string): string {
  const m = /^#\s+(.+)$/m.exec(markdown);
  return m ? cleanText(m[1]) : "";
}

/** 清理行内 Markdown 记号，得到适合放上幻灯片的纯文本 */
export function cleanText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, "（代码块）")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*([^*]*)\*\*/g, "$1")
    .replace(/__([^_]*)__/g, "$1")
    .replace(/\*([^*]*)\*/g, "$1")
    .replace(/_([^_]*)_/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "（图片）")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^>\s?/, "")
    .trim();
}

/** 文件名安全化（去掉路径分隔符与非法字符） */
export function slugify(name: string, fallback: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 60);
  return cleaned || fallback;
}

/**
 * Markdown → 幻灯片结构：
 * - 第一个 `#` 标题作为封面标题；
 * - `##` / `###` 每个分节标题开一页；
 * - 列表项与段落作为要点，超过 8 条自动拆页。
 */
export function markdownToSlides(markdown: string): {
  coverTitle: string;
  sections: SlideSection[];
} {
  const lines = markdown.split(/\r?\n/);
  let coverTitle = "";
  const sections: SlideSection[] = [];
  let title = "";
  let bullets: string[] = [];

  const flush = () => {
    if (!title && bullets.length === 0) return;
    const sectionTitle = title || "内容";
    if (bullets.length === 0) {
      sections.push({ title: sectionTitle, bullets: [] });
    } else {
      for (let i = 0; i < bullets.length; i += MAX_BULLETS_PER_SLIDE) {
        sections.push({
          title: i === 0 ? sectionTitle : `${sectionTitle}（续）`,
          bullets: bullets.slice(i, i + MAX_BULLETS_PER_SLIDE),
        });
      }
    }
    title = "";
    bullets = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const h1 = /^#\s+(.*)$/.exec(line);
    const h2 = /^#{2,3}\s+(.*)$/.exec(line);
    if (h1) {
      if (!coverTitle) coverTitle = cleanText(h1[1]);
      continue;
    }
    if (h2) {
      flush();
      title = cleanText(h2[1]);
      continue;
    }
    const bullet = /^[-*+•]\s+(.*)$/.exec(line) ?? /^\d+[.)]\s+(.*)$/.exec(line);
    const text = cleanText(bullet ? bullet[1] : line);
    if (text) {
      bullets.push(
        text.length > MAX_BULLET_CHARS ? `${text.slice(0, MAX_BULLET_CHARS)}…` : text,
      );
    }
  }
  flush();

  return { coverTitle, sections: sections.filter((s) => s.bullets.length > 0) };
}

function stamp(): string {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
}

/** 文件名基础：优先取内容里的第一个标题，追加时间戳防覆盖 */
export function filenameBase(markdown: string, fallback: string): string {
  return `${slugify(firstHeading(markdown), fallback)}-${stamp()}`;
}

/** 单条内容下载为 .md 文件 */
export function downloadMessageMd(markdown: string, fallbackTitle = "AI 回答"): void {
  downloadText(
    `${filenameBase(markdown, fallbackTitle)}.md`,
    markdown,
    "text/markdown;charset=utf-8",
  );
}

/** 内容生成并下载为 .pptx（懒加载 pptxgenjs，避免进首屏包） */
export async function downloadPptx(markdown: string, fallbackTitle = "AI 回答"): Promise<void> {
  const { default: PptxGenJS } = await import("pptxgenjs");
  const { coverTitle, sections } = markdownToSlides(markdown);
  const title = coverTitle || slugify(fallbackTitle, "AI 回答");
  const base = filenameBase(markdown, fallbackTitle);

  const pres = new PptxGenJS();
  pres.layout = "LAYOUT_WIDE";

  // 封面
  const cover = pres.addSlide();
  cover.background = { color: "F97316" };
  cover.addText(title, {
    x: 0.9,
    y: 2.1,
    w: 11.5,
    h: 1.7,
    fontSize: 40,
    bold: true,
    color: "FFFFFF",
    valign: "top",
  });
  cover.addText(
    `AIDesk 生成 · ${new Date().toLocaleString("zh-CN")}`,
    { x: 0.9, y: 4.1, w: 11.5, h: 0.6, fontSize: 15, color: "FFEDD5" },
  );

  const body = sections.length > 0 ? sections : [{ title: "内容", bullets: ["（无内容）"] }];
  for (const sec of body) {
    const slide = pres.addSlide();
    slide.background = { color: "FFFFFF" };
    slide.addText(sec.title, {
      x: 0.7,
      y: 0.4,
      w: 12,
      h: 0.95,
      fontSize: 26,
      bold: true,
      color: "EA580C",
      valign: "top",
    });
    slide.addText(
      sec.bullets.map((b) => ({
        text: b,
        options: { bullet: { characterCode: "2022", indent: 12 }, breakLine: true },
      })),
      {
        x: 0.85,
        y: 1.55,
        w: 11.6,
        h: 5.4,
        fontSize: 17,
        color: "374151",
        valign: "top",
        lineSpacingMultiple: 1.15,
      },
    );
  }

  try {
    await pres.writeFile({ fileName: `${base}.pptx` });
    toast.success("PPT 已生成，开始下载");
  } catch (err) {
    toast.error(`PPT 生成失败：${err instanceof Error ? err.message : "未知错误"}`);
    throw err;
  }
}
