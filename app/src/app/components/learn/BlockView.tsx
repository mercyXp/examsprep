"use client";

import type { ContentBlock, TextFont } from "@/lib/content";
import { mediaEmbed } from "@/lib/content";
import { ActivityBlock } from "./ActivityBlock";
import { FormattedText } from "./FormattedText";

const SQL_WORDS = /\b(SELECT|FROM|WHERE|AND|OR|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|JOIN|ON|AS|NOT|NULL|PRIMARY|KEY)\b/gi;

function fontClass(font?: TextFont) {
  if (font === "serif") return "lp-font-serif";
  if (font === "mono") return "lp-font-mono";
  return "";
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function highlight(code: string, language: string) {
  const safe = escapeHtml(code);
  if (language !== "sql") return safe;
  return safe.replace(SQL_WORDS, "<mark>$1</mark>");
}

export function BlockView({
  block,
  revealedText,
  check,
}: {
  block: ContentBlock;
  revealedText?: string;
  check?: {
    selectedId: string | null;
    onSelect: (id: string) => void;
    locked?: boolean;
  };
}) {
  if (block.type === "text") {
    const text = revealedText ?? (block.variant === "list" ? "" : block.text);
    const font = fontClass(block.font);
    if (block.variant === "heading") return <h3 className={`lp-h ${font}`}><FormattedText text={text} /></h3>;
    if (block.variant === "definition") return <p className={`lp-def ${font}`}><FormattedText text={text} /></p>;
    if (block.variant === "quote") return <blockquote className={`lp-quote ${font}`}><FormattedText text={text} /></blockquote>;
    if (block.variant === "list") {
      const items = revealedText ? revealedText.split("\n").filter(Boolean) : block.items;
      return (
        <ul className={`lp-list ${font}`}>
          {items.map((item, index) => (
            <li key={`${index}-${item.slice(0, 24)}`}>
              <FormattedText text={item} />
            </li>
          ))}
        </ul>
      );
    }
    return <p className={`lp-p ${font}`}><FormattedText text={text} /></p>;
  }
  if (block.type === "code") {
    return (
      <figure className="lp-code">
        <figcaption>{block.language}</figcaption>
        <pre>
          <code dangerouslySetInnerHTML={{ __html: highlight(block.code, block.language) }} />
        </pre>
      </figure>
    );
  }
  if (block.type === "image") {
    if (!block.url) return <p className="dash-empty">Image URL missing.</p>;
    const width = block.widthPercent && block.widthPercent < 100 ? `${block.widthPercent}%` : undefined;
    return (
      <figure className={`lp-media is-${block.align || "center"}`} style={width ? { width, maxWidth: "100%" } : undefined}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="lp-image" src={block.url} alt={block.alt || "Lesson illustration"} />
        {block.caption ? <figcaption>{block.caption}</figcaption> : null}
      </figure>
    );
  }
  if (block.type === "callout") {
    return (
      <aside className={`lp-callout is-${block.tone}`}>
        <strong>{block.tone}</strong>
        <p><FormattedText text={block.text} /></p>
      </aside>
    );
  }
  if (block.type === "video") {
    const embed = mediaEmbed(block.url);
    if (!embed) return <p className="dash-empty">Add a video URL to show this player.</p>;
    return (
      <figure className="lp-media is-center">
        {block.title ? <figcaption>{block.title}</figcaption> : null}
        {embed.kind === "youtube" ? (
          <div className="lp-embed">
            <iframe
              src={embed.src}
              title={block.title || "Lesson video"}
              allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        ) : (
          <video className="lp-video" src={embed.src} controls preload="metadata" playsInline />
        )}
        {block.caption ? <figcaption>{block.caption}</figcaption> : null}
      </figure>
    );
  }
  if (block.type === "table") {
    const headers = block.headers.length ? block.headers : ["Column 1", "Column 2"];
    return (
      <figure className="lp-table">
        {block.caption ? <figcaption>{block.caption}</figcaption> : null}
        <table>
          <thead>
            <tr>
              {headers.map((header) => (
                <th key={header}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(block.rows.length ? block.rows : [headers.map(() => "")]).map((row, index) => (
              <tr key={index}>
                {headers.map((_, cell) => (
                  <td key={cell}>{row[cell] || ""}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </figure>
    );
  }
  if (block.type === "audio") {
    return (
      <figure className="lp-audio">
        {block.title ? <figcaption>{block.title}</figcaption> : null}
        {block.url ? (
          <audio src={block.url} controls preload="metadata" />
        ) : (
          <p className="dash-empty">Add an audio URL to play this note.</p>
        )}
        {block.transcript ? <p className="lp-transcript">{block.transcript}</p> : null}
      </figure>
    );
  }
  if (block.type === "math" || block.type === "flashcard" || block.type === "quiz" || block.type === "game") {
    return <ActivityBlock block={block} />;
  }
  const selected = check?.selectedId;
  return (
    <fieldset className="lp-check">
      <legend>{block.prompt}</legend>
      {block.options.map((option) => (
        <label key={option.id}>
          <input
            type="radio"
            name={block.id}
            checked={selected === option.id}
            disabled={check?.locked}
            onChange={() => check?.onSelect(option.id)}
          />
          {option.label}
        </label>
      ))}
      {check?.locked && selected ? (
        <p className={selected === block.correctId ? "cms-ok" : "cms-error"}>
          {selected === block.correctId ? block.feedbackCorrect || "Correct." : block.feedbackWrong || "Not quite."} {block.explanation}
        </p>
      ) : null}
    </fieldset>
  );
}
