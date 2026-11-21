const plain = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ");

export function clearReadAlong() {
  try {
    CSS.highlights?.delete("read-along");
  } catch {
    return;
  }
}

export function highlightSentence(
  section: HTMLElement,
  sentence: string,
  scroller?: HTMLElement | null,
) {
  if (!window.CSS?.highlights) return;
  const nodes: [Text, number][] = [];
  const walker = document.createTreeWalker(section, NodeFilter.SHOW_TEXT);
  let raw = "";
  while (walker.nextNode()) {
    const n = walker.currentNode as Text;
    nodes.push([n, raw.length]);
    raw += n.data;
  }
  let hay = "";
  const map: number[] = [];
  for (let i = 0; i < raw.length; i++) {
    const c = (raw[i] ?? "").toLowerCase();
    const w = /[a-z0-9]/.test(c) ? c : " ";
    if (w === " " && hay.endsWith(" ")) continue;
    hay += w;
    map.push(i);
  }
  const needle = plain(sentence).trim();
  if (!needle) return;
  let at = hay.indexOf(needle);
  let len = needle.length;
  if (at < 0) {
    at = hay.indexOf(needle.slice(0, 40));
    len = Math.min(needle.length, hay.length - at);
  }
  if (at < 0 || !nodes.length) return clearReadAlong();
  const pos = (g: number): [Text, number] => {
    for (let k = nodes.length - 1; k >= 0; k--) {
      const node = nodes[k];
      if (node && node[1] <= g) return [node[0], g - node[1]];
    }
    const first = nodes[0] as [Text, number];
    return [first[0], 0];
  };
  const [sn, so] = pos(map[at] ?? 0);
  const [en, eo] = pos(map[Math.min(at + len - 1, map.length - 1)] ?? 0);
  const r = new Range();
  r.setStart(sn, so);
  r.setEnd(en, Math.min(eo + 1, en.data.length));
  CSS.highlights.set("read-along", new Highlight(r));
  if (scroller) {
    const rect = r.getBoundingClientRect();
    const b = scroller.getBoundingClientRect();
    if (rect.top < b.top + 40 || rect.bottom > b.bottom - 80)
      scroller.scrollBy({ top: rect.top - b.top - b.height / 3, behavior: "smooth" });
  }
}
