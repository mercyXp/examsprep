# ExamsPrep documentation

Keep product, design, and architecture notes next to the code. Write a document when there is a real decision; expand folders as features land.

## Now (MVP)

| Document | Path |
| --- | --- |
| Product requirements | [product/prd.md](product/prd.md) |
| Roadmap | [product/roadmap.md](product/roadmap.md) |
| UI/UX specification | [design/ui-ux-spec.md](design/ui-ux-spec.md) |
| System architecture | [architecture/system-architecture.md](architecture/system-architecture.md) |
| Database design | [database/erd.md](database/erd.md) |

## Next, alongside implementation

Create these when the matching work starts — not before.

```
docs/
  product/          prd.md · roadmap.md
  design/           ui-ux-spec.md · animations.md
  architecture/     system-architecture.md · adr/
  database/         erd.md · data-dictionary.md
  api/              openapi.yaml · api-guidelines.md
  ai/               ai-specification.md · ai-evaluation.md
  security/         security.md · privacy.md
  testing/          test-plan.md
  operations/       deployment.md
  user-guides/      student-guide.md · admin-guide.md
```

Also add `CONTRIBUTING.md`, `CHANGELOG.md`, and architecture decision records when those processes exist.
