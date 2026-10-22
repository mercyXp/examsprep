"use client";

import { useState } from "react";
import {
  BLOCK_TYPE_LABELS,
  emptyBlock,
  SLIDE_LAYOUTS,
  emptyResource,
  type AppearMode,
  type ContentBlock,
  type RevealAnimation,
  type Slide,
} from "@/lib/content";
import { MediaUpload } from "./MediaUpload";
import { RichTextField } from "./RichTextField";

export const ANIMATIONS: { id: RevealAnimation; label: string }[] = [
  { id: "fade", label: "Fade In" },
  { id: "up", label: "Slide Up" },
  { id: "left", label: "From left" },
  { id: "right", label: "From right" },
  { id: "zoom", label: "Zoom In" },
  { id: "none", label: "No animation" },
];

export function StudioInspector({
  lessonId,
  slide,
  selected,
  slides,
  slideIndex,
  duration,
  onSlide,
  onBlock,
  onMoveBlock,
  onClearSelection,
  onRemoveBlock,
}: {
  lessonId: string;
  slide: Slide | undefined;
  selected: ContentBlock | null;
  slides: Slide[];
  slideIndex: number;
  duration?: string;
  onSlide: (partial: Partial<Slide>) => void;
  onBlock: (block: ContentBlock) => void;
  onMoveBlock: (index: number) => void;
  onClearSelection?: () => void;
  onRemoveBlock?: (blockId: string) => void;
}) {
  const [tab, setTab] = useState<"properties" | "media">("properties");
  if (!slide) return <p className="dash-empty">Select a slide to edit its properties.</p>;
  const media = slides.flatMap((item) =>
    item.blocks.filter((block) => block.type === "image" || block.type === "video" || block.type === "audio"),
  );
  return (
    <div className="studio-inspector">
      <div className="studio-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "properties"} className={tab === "properties" ? "is-on" : undefined} onClick={() => setTab("properties")}>
          Properties
        </button>
        <button type="button" role="tab" aria-selected={tab === "media"} className={tab === "media" ? "is-on" : undefined} onClick={() => setTab("media")}>
          Media Library
        </button>
      </div>
      {tab === "media" ? (
        <div className="cms-form">
          <p className="cms-muted">Upload from your computer or reuse files already on this lesson.</p>
          <MediaUpload
            lessonId={lessonId}
            kind="image"
            label="Upload image"
            onUploaded={(item) => {
              const block = emptyBlock("image");
              if (block.type === "image") {
                block.url = item.url;
                block.alt = item.originalName;
              }
              onSlide({ blocks: [...slide.blocks, block] });
            }}
          />
          <MediaUpload
            lessonId={lessonId}
            kind="video"
            label="Upload video"
            onUploaded={(item) => {
              const block = emptyBlock("video");
              if (block.type === "video") {
                block.url = item.url;
                block.title = item.originalName;
              }
              onSlide({ blocks: [...slide.blocks, block] });
            }}
          />
          <MediaUpload
            lessonId={lessonId}
            kind="audio"
            label="Upload audio"
            onUploaded={(item) => {
              const block = emptyBlock("audio");
              if (block.type === "audio") {
                block.url = item.url;
                block.title = item.originalName;
              }
              onSlide({ blocks: [...slide.blocks, block] });
            }}
          />
          {media.length ? (
            <ul className="studio-media-list">
              {media.map((block) => (
                <li key={block.id}>
                  <strong>{BLOCK_TYPE_LABELS[block.type]}</strong>
                  <span>{block.type === "image" ? block.alt || block.url : block.type === "video" || block.type === "audio" ? block.title || block.url : block.id}</span>
                  {onRemoveBlock ? (
                    <button type="button" onClick={() => onRemoveBlock(block.id)}>
                      Remove
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="dash-empty">No media on this lesson yet.</p>
          )}
        </div>
      ) : selected ? (
        <>
          <button type="button" className="studio-back" onClick={onClearSelection}>
            ← Slide settings
          </button>
          {onRemoveBlock ? (
            <button type="button" className="studio-btn-delete" onClick={() => onRemoveBlock(selected.id)}>
              Remove {removeName(selected.type)} from slide
            </button>
          ) : null}
          <BlockFields lessonId={lessonId} block={selected} onChange={onBlock} slides={slides} slideIndex={slideIndex} onMove={onMoveBlock} />
        </>
      ) : (
        <SlideFields lessonId={lessonId} slide={slide} duration={duration} onChange={onSlide} />
      )}
    </div>
  );
}

function SlideFields({
  lessonId,
  slide,
  duration,
  onChange,
}: {
  lessonId: string;
  slide: Slide;
  duration?: string;
  onChange: (partial: Partial<Slide>) => void;
}) {
  return (
    <div className="cms-form">
      <p className="studio-kicker">Slide</p>
      <label>
        Slide Title
        <input value={slide.title} onChange={(event) => onChange({ title: event.target.value })} />
      </label>
      <label>
        Slide Type
        <select value={slide.layout || "text"} onChange={(event) => onChange({ layout: event.target.value as Slide["layout"] })}>
          {SLIDE_LAYOUTS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Layout
        <select value={slide.layout || "text"} onChange={(event) => onChange({ layout: event.target.value as Slide["layout"] })}>
          <option value="text">Text</option>
          <option value="text_image">Text & Image (Right)</option>
          <option value="image_text">Image & Text (Left)</option>
          <option value="image">Full-width image</option>
          <option value="two_column">Two column</option>
          <option value="video">Video</option>
          <option value="code">Code</option>
          <option value="assessment">Assessment</option>
          <option value="case">Case study</option>
          <option value="summary">Summary</option>
          <option value="custom">Custom</option>
        </select>
      </label>
      <label>
        Background
        <input type="color" value={isHex(slide.background) ? slide.background : "#ffffff"} onChange={(event) => onChange({ background: event.target.value })} />
      </label>
      <label>
        Transition
        <select value={slide.transition || "fade"} onChange={(event) => onChange({ transition: event.target.value as RevealAnimation })}>
          {ANIMATIONS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <p className="studio-kicker">Reveal Settings</p>
      <label className="studio-switch">
        <span>Show title on load</span>
        <input type="checkbox" checked={slide.titleImmediate !== false} onChange={(event) => onChange({ titleImmediate: event.target.checked })} />
      </label>
      <label className="studio-switch">
        <span>Advance on click / key</span>
        <input type="checkbox" checked={slide.clickToAdvance !== false} onChange={(event) => onChange({ clickToAdvance: event.target.checked })} />
      </label>
      <label>
        Key for next
        <input value="Right Arrow / Space" readOnly />
      </label>
      <label>
        Reveal mode
        <select value={slide.revealMode || "block"} onChange={(event) => onChange({ revealMode: event.target.value as Slide["revealMode"] })}>
          <option value="block">One item per content block</option>
          <option value="sentence">Split paragraphs into sentences</option>
        </select>
      </label>
      <p className="studio-kicker">Accessibility</p>
      <label>
        Alternative text for slide
        <textarea value={slide.altText ?? ""} onChange={(event) => onChange({ altText: event.target.value })} placeholder="Describe the slide for screen readers" />
      </label>
      <p className="studio-kicker">Estimated Reading Time</p>
      <label>
        Minutes
        <input
          type="number"
          min={1}
          max={120}
          value={slide.estimatedMinutes ?? duration ?? 5}
          onChange={(event) => onChange({ estimatedMinutes: Number(event.target.value) || 1 })}
        />
      </label>
      <p className="studio-kicker">Completion</p>
      <label className="studio-switch">
        <span>Student must view all items</span>
        <input type="checkbox" checked={slide.requireAllItems !== false} onChange={(event) => onChange({ requireAllItems: event.target.checked })} />
      </label>
      <p className="studio-kicker">Resources</p>
      {(slide.resources ?? []).map((resource, index) => (
        <div key={resource.id} className="studio-resource">
          <input
            value={resource.title}
            placeholder="Title"
            onChange={(event) => {
              const resources = [...(slide.resources ?? [])];
              resources[index] = { ...resource, title: event.target.value };
              onChange({ resources });
            }}
          />
          <input
            value={resource.url}
            placeholder="https:// or upload a file"
            onChange={(event) => {
              const resources = [...(slide.resources ?? [])];
              resources[index] = { ...resource, url: event.target.value };
              onChange({ resources });
            }}
          />
          <MediaUpload
            lessonId={lessonId}
            kind="file"
            label="Upload file"
            onUploaded={(item) => {
              const resources = [...(slide.resources ?? [])];
              resources[index] = { ...resource, url: item.url, title: resource.title || item.originalName };
              onChange({ resources });
            }}
          />
          <button type="button" onClick={() => onChange({ resources: (slide.resources ?? []).filter((item) => item.id !== resource.id) })}>
            Remove link
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange({ resources: [...(slide.resources ?? []), emptyResource()] })}>
        Add resource
      </button>
    </div>
  );
}

function BlockFields({
  lessonId,
  block,
  onChange,
  slides,
  slideIndex,
  onMove,
}: {
  lessonId: string;
  block: ContentBlock;
  onChange: (block: ContentBlock) => void;
  slides: Slide[];
  slideIndex: number;
  onMove: (index: number) => void;
}) {
  return (
    <div className="cms-form">
      <p className="studio-kicker">{BLOCK_TYPE_LABELS[block.type]}</p>
      {block.type === "text" ? (
        <>
          <label>
            Variant
            <select value={block.variant} onChange={(event) => onChange({ ...block, variant: event.target.value as typeof block.variant })}>
              <option value="heading">Heading</option>
              <option value="paragraph">Paragraph</option>
              <option value="list">List</option>
              <option value="definition">Definition</option>
              <option value="quote">Quote</option>
            </select>
          </label>
          <label>
            Font style
            <select value={block.font || "sans"} onChange={(event) => onChange({ ...block, font: event.target.value as typeof block.font })}>
              <option value="sans">Sans</option>
              <option value="serif">Serif</option>
              <option value="mono">Monospace</option>
            </select>
          </label>
          {block.variant === "list" ? (
            <RichTextField label="Items (one per line)" value={block.items.join("\n")} onChange={(value) => onChange({ ...block, items: value.split("\n") })} />
          ) : (
            <RichTextField label="Text" value={block.text} onChange={(value) => onChange({ ...block, text: value })} />
          )}
        </>
      ) : null}
      {block.type === "code" ? (
        <>
          <label>
            Language
            <select value={block.language} onChange={(event) => onChange({ ...block, language: event.target.value })}>
              <option value="sql">SQL</option>
              <option value="python">Python</option>
              <option value="javascript">JavaScript</option>
              <option value="java">Java</option>
              <option value="text">Text</option>
            </select>
          </label>
          <label>
            Code
            <textarea className="is-code" value={block.code} onChange={(event) => onChange({ ...block, code: event.target.value })} />
          </label>
        </>
      ) : null}
      {block.type === "image" ? (
        <>
          <MediaUpload
            lessonId={lessonId}
            kind="image"
            onUploaded={(item) => onChange({ ...block, url: item.url, alt: block.alt || item.originalName })}
          />
          <label>
            Image URL
            <input value={block.url} onChange={(event) => onChange({ ...block, url: event.target.value })} />
          </label>
          <label>
            Alternative text
            <input value={block.alt} onChange={(event) => onChange({ ...block, alt: event.target.value })} />
          </label>
          <label>
            Caption
            <input value={block.caption ?? ""} onChange={(event) => onChange({ ...block, caption: event.target.value })} />
          </label>
          <label>
            Alignment
            <select value={block.align || "center"} onChange={(event) => onChange({ ...block, align: event.target.value as typeof block.align })}>
              <option value="left">Left</option>
              <option value="center">Centre</option>
              <option value="right">Right</option>
            </select>
          </label>
          <label>
            Width ({block.widthPercent ?? 100}%)
            <input
              type="range"
              min={20}
              max={100}
              value={block.widthPercent ?? 100}
              onChange={(event) => onChange({ ...block, widthPercent: Number(event.target.value) })}
            />
          </label>
        </>
      ) : null}
      {block.type === "callout" ? (
        <>
          <label>
            Tone
            <select value={block.tone} onChange={(event) => onChange({ ...block, tone: event.target.value as typeof block.tone })}>
              <option value="note">Note</option>
              <option value="tip">Tip</option>
              <option value="warning">Warning</option>
              <option value="important">Important</option>
            </select>
          </label>
          <RichTextField label="Text" value={block.text} onChange={(value) => onChange({ ...block, text: value })} />
        </>
      ) : null}
      {block.type === "video" ? (
        <>
          <MediaUpload
            lessonId={lessonId}
            kind="video"
            onUploaded={(item) => onChange({ ...block, url: item.url, title: block.title || item.originalName })}
          />
          <label>
            Video URL
            <input value={block.url} onChange={(event) => onChange({ ...block, url: event.target.value })} />
          </label>
          <label>
            Title
            <input value={block.title} onChange={(event) => onChange({ ...block, title: event.target.value })} />
          </label>
          <label>
            Caption
            <input value={block.caption} onChange={(event) => onChange({ ...block, caption: event.target.value })} />
          </label>
        </>
      ) : null}
      {block.type === "audio" ? (
        <>
          <MediaUpload
            lessonId={lessonId}
            kind="audio"
            onUploaded={(item) => onChange({ ...block, url: item.url, title: block.title || item.originalName })}
          />
          <label>
            Audio URL
            <input value={block.url} onChange={(event) => onChange({ ...block, url: event.target.value })} />
          </label>
          <label>
            Title
            <input value={block.title} onChange={(event) => onChange({ ...block, title: event.target.value })} />
          </label>
          <label>
            Transcript
            <textarea value={block.transcript} onChange={(event) => onChange({ ...block, transcript: event.target.value })} />
          </label>
        </>
      ) : null}
      {block.type === "table" ? (
        <>
          <label>
            Caption
            <input value={block.caption} onChange={(event) => onChange({ ...block, caption: event.target.value })} />
          </label>
          <label>
            Headers (comma separated)
            <input
              value={block.headers.join(", ")}
              onChange={(event) => onChange({ ...block, headers: splitCells(event.target.value, ",") })}
            />
          </label>
          <label>
            Rows (one per line, cells with |)
            <textarea
              value={block.rows.map((row) => row.join(" | ")).join("\n")}
              onKeyDown={(event) => {
                if (event.key === " ") event.stopPropagation();
              }}
              onChange={(event) =>
                onChange({
                  ...block,
                  rows: event.target.value.split("\n").map((line) => splitCells(line, "|")),
                })
              }
            />
          </label>
        </>
      ) : null}
      {block.type === "check" ? (
        <>
          <label>
            Question
            <textarea value={block.prompt} onChange={(event) => onChange({ ...block, prompt: event.target.value })} />
          </label>
          {block.options.map((option, index) => (
            <label key={option.id}>
              Option {index + 1}
              <input
                value={option.label}
                onChange={(event) => {
                  const options = block.options.map((item) => (item.id === option.id ? { ...item, label: event.target.value } : item));
                  onChange({ ...block, options });
                }}
              />
            </label>
          ))}
          <div className="cms-actions">
            <button
              type="button"
              onClick={() => onChange({ ...block, options: [...block.options, { id: crypto.randomUUID(), label: `Option ${block.options.length + 1}` }] })}
            >
              Add option
            </button>
            {block.options.length > 2 ? (
              <button type="button" onClick={() => onChange({ ...block, options: block.options.slice(0, -1) })}>
                Remove last
              </button>
            ) : null}
          </div>
          <label>
            Correct option
            <select value={block.correctId} onChange={(event) => onChange({ ...block, correctId: event.target.value })}>
              {block.options.map((option, index) => (
                <option key={option.id} value={option.id}>
                  Option {index + 1}
                </option>
              ))}
            </select>
          </label>
          <label>
            Explanation
            <textarea value={block.explanation} onChange={(event) => onChange({ ...block, explanation: event.target.value })} />
          </label>
        </>
      ) : null}
      <p className="studio-kicker">Reveal</p>
      <label>
        Appear
        <select value={block.appear || "click"} onChange={(event) => onChange({ ...block, appear: event.target.value as AppearMode })}>
          <option value="click">On click</option>
          <option value="immediate">Immediately</option>
        </select>
      </label>
      <label>
        Animation
        <select value={block.animation || "fade"} onChange={(event) => onChange({ ...block, animation: event.target.value as RevealAnimation })}>
          {ANIMATIONS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <label className="studio-switch">
        <span>Full-notes only</span>
        <input type="checkbox" checked={Boolean(block.notesOnly)} onChange={(event) => onChange({ ...block, notesOnly: event.target.checked })} />
      </label>
      <label>
        Move to slide
        <select value={String(slideIndex)} onChange={(event) => onMove(Number(event.target.value))}>
          {slides.map((item, index) => (
            <option key={item.id} value={index}>
              {item.title || `Slide ${index + 1}`}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function splitCells(value: string, separator: string) {
  const parts = value.split(separator);
  return parts.map((part, index) => (index === parts.length - 1 ? part.replace(/^ /, "") : part.replace(/ $/, "")));
}

function removeName(type: string) {
  if (type === "image") return "image";
  if (type === "video") return "video";
  if (type === "audio") return "audio";
  if (type === "text") return "text";
  if (type === "check") return "question";
  return "item";
}

function isHex(value?: string) {
  return Boolean(value && /^#[0-9a-fA-F]{6}$/.test(value));
}
