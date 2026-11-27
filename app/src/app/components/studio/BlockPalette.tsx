"use client";

import type { LucideIcon } from "lucide-react";
import {
  AudioLines,
  CircleHelp,
  ClipboardList,
  Code,
  Gamepad2,
  Image,
  Layers,
  ListChecks,
  Network,
  Paperclip,
  Sigma,
  Table,
  Type,
  Video,
} from "lucide-react";
import type { BlockType } from "@/lib/content";

export type PalettePick =
  | { action: "block"; type: BlockType }
  | { action: "resource" }
  | { action: "activity" };

const GROUPS: {
  id: string;
  label: string;
  items: { id: string; label: string; hint: string; icon: LucideIcon; pick: PalettePick }[];
}[] = [
  {
    id: "basics",
    label: "Basics",
    items: [
      { id: "text", label: "Text", hint: "Add a text block", icon: Type, pick: { action: "block", type: "text" } },
      { id: "image", label: "Image", hint: "Add an image block", icon: Image, pick: { action: "block", type: "image" } },
      { id: "video", label: "Video", hint: "Add a video block", icon: Video, pick: { action: "block", type: "video" } },
      { id: "audio", label: "Audio", hint: "Add an audio block", icon: AudioLines, pick: { action: "block", type: "audio" } },
      { id: "table", label: "Table", hint: "Add a table", icon: Table, pick: { action: "block", type: "table" } },
      { id: "code", label: "Code", hint: "Add a code block", icon: Code, pick: { action: "block", type: "code" } },
      { id: "math", label: "Math", hint: "Add a formula", icon: Sigma, pick: { action: "block", type: "math" } },
      { id: "diagram", label: "Diagram", hint: "Add a diagram image", icon: Network, pick: { action: "block", type: "image" } },
    ],
  },
  {
    id: "interactive",
    label: "Interactive",
    items: [
      { id: "question", label: "Question", hint: "Add a knowledge check", icon: CircleHelp, pick: { action: "block", type: "check" } },
      { id: "quiz", label: "Quiz", hint: "Add a quiz question", icon: ListChecks, pick: { action: "block", type: "quiz" } },
      { id: "flashcard", label: "Flashcard", hint: "Add a flashcard", icon: Layers, pick: { action: "block", type: "flashcard" } },
      { id: "game", label: "Game", hint: "Add a game", icon: Gamepad2, pick: { action: "block", type: "game" } },
      { id: "activity", label: "Activity", hint: "Add an activity callout", icon: ClipboardList, pick: { action: "activity" } },
    ],
  },
  {
    id: "resource",
    label: "Resource",
    items: [{ id: "resource", label: "Resource", hint: "Add a link or file", icon: Paperclip, pick: { action: "resource" } }],
  },
];

export function BlockPalette({ onPick }: { onPick: (pick: PalettePick) => void }) {
  return (
    <>
      <p>Content</p>
      {GROUPS.map((group) => (
        <div key={group.id} className="studio-palette-group" role="group" aria-label={group.label}>
          <h3>{group.label}</h3>
          {group.items.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} type="button" title={item.hint} onClick={() => onPick(item.pick)}>
                <Icon size={16} strokeWidth={2} aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      ))}
    </>
  );
}
