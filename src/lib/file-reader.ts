/** 文件附件（仅客户端使用） */
export interface FileAttachment {
  name: string;
  kind: "text" | "image";
  /** 文本类附件提取出的内容 */
  text?: string;
  /** 图片类附件的 data URL（已压缩） */
  dataUrl?: string;
  size: number;
}

const TEXT_EXTENSIONS = [
  "txt", "md", "markdown", "json", "csv", "ts", "tsx", "js", "jsx", "py", "java",
  "c", "cpp", "h", "go", "rs", "rb", "php", "swift", "kt", "sh", "bash", "yaml",
  "yml", "toml", "log", "sql", "html", "css", "xml",
];

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

const MAX_TEXT_CHARS = 200_000;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const IMAGE_MAX_EDGE = 896;

export function extensionOf(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

/** 解析用户选择的文件为可发送给模型的附件 */
export async function parseAttachment(file: File): Promise<FileAttachment> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`「${file.name}」超过 20MB 限制`);
  }
  const ext = extensionOf(file.name);

  if (file.type === "application/pdf" || ext === "pdf") {
    const text = await readPdfText(await file.arrayBuffer());
    if (!text.trim()) {
      throw new Error(`「${file.name}」未提取到文本（扫描版 PDF 请先 OCR）`);
    }
    return { name: file.name, kind: "text", text: truncate(text), size: file.size };
  }

  if (IMAGE_TYPES.includes(file.type)) {
    const dataUrl = await downscaleImage(file);
    return { name: file.name, kind: "image", dataUrl, size: file.size };
  }

  if (TEXT_EXTENSIONS.includes(ext)) {
    const text = await file.text();
    return { name: file.name, kind: "text", text: truncate(text), size: file.size };
  }

  throw new Error(`不支持的文件类型「${file.name}」：仅支持文本类文件、PDF 与常见图片`);
}

function truncate(text: string): string {
  if (text.length <= MAX_TEXT_CHARS) return text;
  return `${text.slice(0, MAX_TEXT_CHARS)}\n……（内容过长，已截断）`;
}

async function readPdfText(data: ArrayBuffer): Promise<string> {
  // 动态导入：pdf.js 只在浏览器中解析 PDF 时加载，避免服务端预渲染报错
  const pdfjs = await import("pdfjs-dist");
  try {
    // 若打包器不支持此 URL 形态，pdf.js 会回退到主线程 fake worker（仍可用，仅更慢）
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
  } catch {
    // 使用默认（fake worker）
  }
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
  let out = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    for (const item of content.items) {
      if ("str" in item) out += `${item.str} `;
    }
    out += "\n\n";
  }
  return out;
}

/** 压缩图片到合适尺寸，输出 JPEG data URL */
function downscaleImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        let { width, height } = img;
        if (width > IMAGE_MAX_EDGE || height > IMAGE_MAX_EDGE) {
          const scale = Math.min(IMAGE_MAX_EDGE / width, IMAGE_MAX_EDGE / height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("无法创建画布");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      } catch (err) {
        reject(err instanceof Error ? err : new Error("图片处理失败"));
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`「${file.name}」图片读取失败`));
    };
    img.src = url;
  });
}
