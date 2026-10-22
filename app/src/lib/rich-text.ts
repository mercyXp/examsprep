export type RichMark = "strong" | "em" | "u" | "mark";

export type RichNode = string | { type: RichMark; children: RichNode[] };

const MARKERS: { open: string; close: string; type: RichMark }[] = [
  { open: "**", close: "**", type: "strong" },
  { open: "==", close: "==", type: "mark" },
  { open: "++", close: "++", type: "u" },
  { open: "*", close: "*", type: "em" },
];

export function parseRichText(input: string): RichNode[] {
  return read(input, 0, "").nodes;
}

function read(input: string, index: number, until: string): { nodes: RichNode[]; index: number; closed: boolean } {
  const nodes: RichNode[] = [];
  let buffer = "";
  const flush = () => {
    if (!buffer) return;
    nodes.push(buffer);
    buffer = "";
  };
  while (index < input.length) {
    if (until && input.startsWith(until, index)) {
      flush();
      return { nodes, index: index + until.length, closed: true };
    }
    const marker = MARKERS.find((item) => input.startsWith(item.open, index));
    if (marker && input.indexOf(marker.close, index + marker.open.length) !== -1) {
      const inner = read(input, index + marker.open.length, marker.close);
      if (inner.closed) {
        flush();
        nodes.push({ type: marker.type, children: inner.nodes });
        index = inner.index;
        continue;
      }
    }
    buffer += input[index];
    index += 1;
  }
  flush();
  return { nodes, index, closed: until === "" };
}

export function stripRichText(value: string) {
  return value
    .replaceAll("**", "")
    .replaceAll("==", "")
    .replaceAll("++", "")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1$2");
}

export function applyFormat(value: string, start: number, end: number, open: string, close = open) {
  const safeStart = Math.max(0, Math.min(start, value.length));
  const safeEnd = Math.max(safeStart, Math.min(end, value.length));
  const selected = value.slice(safeStart, safeEnd);
  const before = value.slice(0, safeStart);
  const after = value.slice(safeEnd);
  const wrapped = selected.startsWith(open) && selected.endsWith(close) && selected.length >= open.length + close.length;
  if (wrapped) {
    const inner = selected.slice(open.length, selected.length - close.length);
    return { value: before + inner + after, start: safeStart, end: safeStart + inner.length };
  }
  if (before.endsWith(open) && after.startsWith(close)) {
    const next = before.slice(0, -open.length) + selected + after.slice(close.length);
    const nextStart = safeStart - open.length;
    return { value: next, start: nextStart, end: nextStart + selected.length };
  }
  const body = selected || "text";
  const next = `${before}${open}${body}${close}${after}`;
  const nextStart = safeStart + open.length;
  return { value: next, start: nextStart, end: nextStart + body.length };
}
