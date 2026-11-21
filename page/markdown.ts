import "./md.js";

type TalkMarkdown = { render(text: string): string; inline(text: string): string };
const md = (globalThis as unknown as { TalkMarkdown: TalkMarkdown }).TalkMarkdown;

export const renderMarkdown = (text: string) => md.render(text);
export const renderInline = (text: string) => md.inline(text);
