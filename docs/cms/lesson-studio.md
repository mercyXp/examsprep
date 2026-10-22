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

Supported `type` values: `text`, `code`, `image`, `callout`, `check`, `video`, `audio`, `table`.

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

Question bank builder, drag-and-drop questions, essay rubrics, AI authoring/grading, cloud object storage, templates library, revision diff UI, and scheduled publish.

## Environment

Existing `DATABASE_URL` and `examsprep_token` auth are required. Optional `MEDIA_ROOT` (default `var/media` under `api/`) stores uploaded images, video, audio, and PDFs on disk. An AI provider is not required for authoring.
