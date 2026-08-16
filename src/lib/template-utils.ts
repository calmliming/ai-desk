/** 提示词模板的变量占位符工具（纯函数，可独立测试） */

/** 提取 {{变量}} 占位符（去重，保持出现顺序） */
export function extractVariables(content: string): string[] {
  const out: string[] = [];
  for (const match of content.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)) {
    const name = match[1];
    if (!out.includes(name)) out.push(name);
  }
  return out;
}

/** 用给定的值填充模板；未填写的变量保持原样 */
export function fillTemplate(
  content: string,
  values: Record<string, string>,
): string {
  return content.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_all, name: string) => {
    const value = values[name]?.trim();
    return value ? value : `{{${name}}}`;
  });
}
