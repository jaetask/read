(() => {
  const esc = (s) =>
    String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const safeUrl = (u) =>
    /^(https?:|mailto:|#|\/|\.{0,2}\/)/i.test(u) || !/^[a-z][a-z0-9+.-]*:/i.test(u) ? u : "#";

  function inline(text) {
    const keep = [];
    const hold = (html) => `\u0000${keep.push(html) - 1}\u0000`;
    let t = String(text);
    t = t.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (_, __, c) =>
      hold(`<code>${esc(c.trim() || c)}</code>`),
    );
    t = t.replace(/\\([\\`*_{}[\]()#+\-.!|~>])/g, (_, c) => hold(esc(c)));
    t = t.replace(/!\[([^\]]*)\]\(((?:[^()\s]|\([^()\s]*\))+)(?:\s+"[^"]*")?\)/g, (_, alt, u) =>
      hold(`<a href="${esc(safeUrl(u))}" target="_blank" rel="noopener">${esc(alt || u)}</a>`),
    );
    t = t.replace(/\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)(?:\s+"[^"]*")?\)/g, (_, label, u) =>
      hold(`<a href="${esc(safeUrl(u))}" target="_blank" rel="noopener">${inline(label)}</a>`),
    );
    t = t.replace(/<(https?:\/\/[^\s>]+)>/g, (_, u) =>
      hold(`<a href="${esc(u)}" target="_blank" rel="noopener">${esc(u)}</a>`),
    );
    t = esc(t)
      .replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, "<strong>$2</strong>")
      .replace(/(^|[^\w*])\*(?=\S)([^*]*?\S)\*(?!\*)/g, "$1<em>$2</em>")
      .replace(/(^|[^\w])_(?=\S)([^_]*?\S)_(?!\w)/g, "$1<em>$2</em>")
      .replace(/~~(?=\S)([\s\S]*?\S)~~/g, "<del>$1</del>");
    return t.replace(/\u0000(\d+)\u0000/g, (_, i) => keep[+i]);
  }

  const DELIM = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
  function cells(line) {
    let s = line.trim();
    if (s.startsWith("|")) s = s.slice(1);
    if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
    const out = [];
    let cur = "",
      tick = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === "\\" && s[i + 1] === "|") {
        cur += "|";
        i++;
        continue;
      }
      if (c === "`") tick = tick ? 0 : 1;
      if (c === "|" && !tick) {
        out.push(cur.trim());
        cur = "";
        continue;
      }
      cur += c;
    }
    out.push(cur.trim());
    return out;
  }
  const isTableStart = (lines, i) =>
    lines[i].includes("|") &&
    i + 1 < lines.length &&
    DELIM.test(lines[i + 1]) &&
    lines[i + 1].includes("-") &&
    (lines[i + 1].includes("|") || cells(lines[i]).length === 1);
  function table(head, delim, rows) {
    const align = cells(delim).map((d) =>
      /^:-+:$/.test(d) ? "center" : /-+:$/.test(d) ? "right" : /^:-+/.test(d) ? "left" : "",
    );
    const n = head.length;
    const cell = (tag, c, k) =>
      `<${tag}${align[k] ? ` style="text-align:${align[k]}"` : ""}>${inline(c ?? "")}</${tag}>`;
    const row = (tag, cs) =>
      `<tr>${Array.from({ length: n }, (_, k) => cell(tag, cs[k], k)).join(" ")}</tr>`;
    return (
      `<div class="tbl"><table><thead>${row("th", head)}</thead>` +
      (rows.length ? `<tbody>\n${rows.map((r) => row("td", r)).join("\n")}\n</tbody>` : "") +
      "</table></div>"
    );
  }

  const FENCE = /^\s{0,3}(```+|~~~+)\s*([\w+-]*)/;
  const HEAD = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
  const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
  const ITEM = /^(\s*)([-*+•]|\d{1,9}[.)])\s+(.*)$/;
  const QUOTE = /^\s{0,3}>\s?(.*)$/;
  const indent = (s) => s.replace(/\t/g, "    ").match(/^ */)[0].length;
  const startsBlock = (lines, i) =>
    FENCE.test(lines[i]) ||
    HEAD.test(lines[i]) ||
    RULE.test(lines[i]) ||
    QUOTE.test(lines[i]) ||
    ITEM.test(lines[i]) ||
    isTableStart(lines, i);

  function list(lines, i) {
    const base = indent(lines[i]),
      ordered = /\d/.test(ITEM.exec(lines[i])[2]);
    const start = ordered ? parseInt(ITEM.exec(lines[i])[2], 10) : 1;
    const items = [];
    while (i < lines.length) {
      const m = ITEM.exec(lines[i]);
      if (!m || indent(lines[i]) !== base || /\d/.test(m[2]) !== ordered) break;
      const body = [m[3]];
      i++;
      while (
        i < lines.length &&
        lines[i].trim() &&
        !(ITEM.test(lines[i]) && indent(lines[i]) <= base)
      ) {
        body.push(
          indent(lines[i]) > base
            ? lines[i].replace(new RegExp(`^ {0,${base + 4}}`), "")
            : lines[i].trim(),
        );
        i++;
      }
      if (
        i < lines.length &&
        !lines[i].trim() &&
        i + 1 < lines.length &&
        indent(lines[i + 1]) > base &&
        lines[i + 1].trim()
      )
        i++;
      items.push(body);
    }
    const tag = ordered ? "ol" : "ul";
    const html = items
      .map((b) => {
        const [first, ...rest] = b;
        const nested = rest.length ? blocks(rest) : "";
        return `<li>${inline(first)}${nested}</li>`;
      })
      .join("");
    return [`<${tag}${ordered && start !== 1 ? ` start="${start}"` : ""}>${html}</${tag}>`, i];
  }

  function blocks(lines) {
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) {
        i++;
        continue;
      }
      let m;
      if ((m = FENCE.exec(line))) {
        const close = new RegExp(`^\\s{0,3}${m[1][0] === "`" ? "`" : "~"}{${m[1].length},}\\s*$`),
          code = [];
        for (i++; i < lines.length && !close.test(lines[i]); i++) code.push(lines[i]);
        i++;
        out.push(
          `<pre><code${m[2] ? ` class="lang-${esc(m[2])}"` : ""}>${esc(code.join("\n"))}</code></pre>`,
        );
        continue;
      }
      if ((m = HEAD.exec(line))) {
        const lv = m[1].length;
        out.push(`<h${lv}>${inline(m[2])}</h${lv}>`);
        i++;
        continue;
      }
      if (RULE.test(line)) {
        out.push("<hr>");
        i++;
        continue;
      }
      if (isTableStart(lines, i)) {
        const head = cells(line),
          delim = lines[i + 1],
          rows = [];
        for (i += 2; i < lines.length && lines[i].trim() && lines[i].includes("|"); i++)
          rows.push(cells(lines[i]));
        out.push(table(head, delim, rows));
        continue;
      }
      if (QUOTE.test(line)) {
        const q = [];
        for (
          ;
          i < lines.length && lines[i].trim() && (m = QUOTE.exec(lines[i]) || [null, lines[i]]);
          i++
        ) {
          if (!QUOTE.test(lines[i]) && startsBlock(lines, i)) break;
          q.push(m[1]);
        }
        out.push(`<blockquote>${blocks(q)}</blockquote>`);
        continue;
      }
      if (ITEM.test(line)) {
        const [html, j] = list(lines, i);
        out.push(html);
        i = j;
        continue;
      }
      const para = [];
      for (; i < lines.length && lines[i].trim() && (!para.length || !startsBlock(lines, i)); i++)
        para.push(lines[i].trim());
      out.push(`<p>${para.map(inline).join("<br>")}</p>`);
    }
    return out.join("");
  }

  const render = (text) =>
    blocks(
      String(text ?? "")
        .replace(/\r\n?/g, "\n")
        .split("\n"),
    );
  globalThis.TalkMarkdown = { render, inline, esc };
})();
