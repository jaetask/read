import { extractText, getDocumentProxy, getMeta } from "unpdf";

export function pageProse(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(/-\n(?=[a-z])/g, "")
    .split(/\n\s*\n/)
    .map((para) => para.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean)
    .map((para) => para.replace(/^(#{1,6})(\s)/, "\\$1$2"))
    .join("\n\n");
}

export async function pdfMarkdown(bytes: Uint8Array, fallbackTitle: string): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const meta = await getMeta(pdf).catch(() => undefined);
  const named = String((meta?.info as { Title?: unknown } | undefined)?.Title ?? "").trim();
  const { text } = await extractText(pdf, { mergePages: false });
  const pages = text.map((page, i) => `## Page ${i + 1}\n\n${pageProse(page)}`);
  await pdf.cleanup();
  return `# ${named || fallbackTitle}\n\n${pages.join("\n\n")}`;
}
