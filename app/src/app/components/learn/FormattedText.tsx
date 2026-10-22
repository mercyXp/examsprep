import { parseRichText, type RichNode } from "@/lib/rich-text";

export function FormattedText({ text }: { text: string }) {
  return <>{renderNodes(parseRichText(text), "r")}</>;
}

function renderNodes(nodes: RichNode[], keyPrefix: string) {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;
    if (typeof node === "string") {
      const lines = node.split("\n");
      return (
        <span key={key}>
          {lines.map((line, lineIndex) => (
            <span key={`${key}-${lineIndex}`}>
              {lineIndex > 0 ? <br /> : null}
              {line}
            </span>
          ))}
        </span>
      );
    }
    const children = renderNodes(node.children, key);
    if (node.type === "strong") return <strong key={key}>{children}</strong>;
    if (node.type === "em") return <em key={key}>{children}</em>;
    if (node.type === "u") return <u key={key}>{children}</u>;
    return <mark key={key} className="lp-mark">{children}</mark>;
  });
}
