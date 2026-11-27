# ExamsPrep Lesson Authoring Studio

The studio at `/admin/lessons/[lessonId]/edit` extends the existing CMS. Slides stay in `lesson_versions.slides` JSONB. Students still only see the published version; staff preview uses `?preview=1` on the same player.

In the studio tree, the catalogue **module** (for example IT212) is the course at the top. **Chapters** are labelled **Units**. The database `modules` table is unchanged.

## Content schema

Each slide:

```json
{
  "id": "uuid",
  "title": "Introduction to Systems Analysis",
  "layout": "text",
  "revealMode": "block",
  "titleImmediate": true,
  "transition": "fade",
  "background": "",
  "resources": [{ "id": "uuid", "title": "Reading", "description": "", "kind": "link", "url": "https://..." }],
  "blocks": []
}
```

Each block is one reveal item by default. It has `id`, `type`, type-specific fields, plus:

- `appear`: `click` | `immediate`
- `animation`: `fade` | `none` | `up` | `left` | `right` | `zoom`
- `notesOnly`: hidden in presentation, shown in **Read Full Notes**

Supported `type` values: `text`, `code`, `image`, `callout`, `check`, `video`, `audio`, `table`, `math`, `flashcard`, `quiz`, `game`.

`math` stores `latex` and an optional `caption`. `flashcard` stores `front` and `back`. `quiz` is `kind: "mcq"` (options plus `correctId`) or `kind: "blank"` (an `answer` string). `game` is `kind: "matching"` (`pairs` of `left` and `right`) or `kind: "drag"` (`bins` and `items` with a `bin`). Older lessons that only use the original types still render. A missing `correctId` is kept empty so the studio can warn before submit; it is not treated as option A.

Text and callout blocks can include word formatting: `**bold**`, `*italic*`, `++underline++`, and `==highlight==`. A text block can also set `font` to `sans`, `serif`, or `mono`. The editor toolbar writes these markers, and the player renders them. **Next line**, and Enter in the text box, store a newline. The player shows that break.

`revealMode: "sentence"` is optional. The default is `block`, where one block is one reveal. **+ Add sentence** inserts another text block in the reveal sequence. **Split** divides an existing text block into sentence blocks. Do not use sentence mode as the default.

Authors can remove a text block, image, video, audio clip, or link from the slide. The canvas, the inspector, and the reveal list ask for confirmation. Table headers are separated with commas and cells with `|`. Spaces typed inside a cell are kept.

Presentation mode and full-notes mode read the same `slides` array. There is no second copy of the notes.

## Progressive reveal

1. The slide title appears when `titleImmediate` is true.
2. Immediate items and the first on-click item are visible at the start.
3. Next point (click canvas, Next point, Space, →) reveals the next item on the **same** slide.
4. Earlier items stay visible.
5. Next slide runs only after every presentation item on the current slide has been revealed.

Student progress (`current_slide_index`, `revealed_units`, `check_results`) is stored separately from editable content.

## Block editor

Open **Block editor** in the studio. Type `/` to insert a heading, text, image, code, math formula, table, flashcard, quiz, or game. Drag the handle to reorder. Undo, redo, and autosave use the same lesson JSON as presentation mode. Phone and desktop preview sit beside the editor and use the student renderer.

## Import, templates, and drafts

Paste notes or upload `.pptx`, `.pdf`, or `.docx`. Headings become slides, bullets become reveal items, and tables, code, and supported images are kept. Templates are lecture notes, topic + quiz, revision sheet, and mock exam.

Summarise, flashcards, quiz, game, and mock exam call the swappable AI provider when `AI_API_KEY` is set. With no key, or if the provider fails, the API writes a local draft and says so. Generated lessons and question-bank rows are saved as `DRAFT`. Nothing in these actions publishes.

The question bank at `/admin/questions` accepts a past-paper PDF (split into questions), CSV or XLSX, topic tags, and model answers. A spreadsheet needs a header row. Use `prompt`, `kind` (`mcq`, `blank`, or `short`), `option_a` through `option_e`, `correct` (a letter or the option text), `explanation`, `model_answer`, and `topic`. A `status` column is ignored. Games can be saved and dropped into another lesson. Copy a lesson or a chapter only into a module the editor can already access. The copy is a new draft.

Before submit or publish, the studio warns about empty slides, quizzes with no correct answer, and images that have no file or a missing upload. The warning does not publish the lesson. A reviewer still uses the existing approve and publish actions.

## Adding a content type

1. Add the type to `BLOCK_TYPES` in `api/app/cms.py` and validate it in `clean_block`.
2. Add the TypeScript shape to `app/src/lib/content.ts` (`ContentBlock`, `emptyBlock`, `parseBlock`, `blockPreview`).
3. Render it in `BlockView`.
4. Add inspector fields in `StudioInspector`.
5. Keep the item in the ordered `blocks` array so the player and notes reader pick it up automatically.

## Permissions

Unchanged: FastAPI `AccessScope` on every create, update, submit, review, and publish call. Creators cannot publish. Program administrators stay inside assigned programmes. Unpublished drafts are not returned to students.

## Phase 1 implemented

- Three-column studio with autosave, save status, undo/redo, Save draft, Submit / Publish
- Author-controlled reveal sequence, duplicate/reorder/delete, student preview
- Presentation player: Next/Previous point and slide, keyboard, full notes
- Image, video, and audio from a computer upload or a URL; YouTube embeds; knowledge-check; resources sidebar

## Later phases

Essay rubrics, AI grading, cloud object storage, a revision diff, and scheduled publish. Student quiz attempts outside a lesson are still the empty quizzes page. Quiz, flashcard, and game blocks inside a published lesson play in the lesson player.

## Environment

Existing `DATABASE_URL` and `examsprep_token` auth are required. Optional `MEDIA_ROOT` (default `var/media` under `api/`) stores uploaded images, video, audio, and PDFs on disk.

AI authoring is optional:

```
AI_PROVIDER=auto
AI_API_KEY=
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-4o-mini
```

`auto` calls `AI_BASE_URL/chat/completions` when `AI_API_KEY` is set, and writes a local draft otherwise. `heuristic` always stays local. Any OpenAI-compatible base URL can replace the provider without changing the studio.
