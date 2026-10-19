# UI/UX specification

## Identity

- **Headings:** Bricolage Grotesque, extra-bold, tight tracking.
- **Body:** Inter.
- **Primary:** `#3444DA`. **Violet (link hover underline):** `#7B5CFF`.
- **Buttons:** 48px height, 14px radius, silver sweep + press scale 0.96.
- **Cards:** 24px radius.
- **Theme:** `html[data-theme="light"|"dark"]`, header moon/sun toggle, boot script to avoid a flash.
- **Logo:** light = `logo_light` lockup; dark = mark + white “ExamPrep”.
- **Hero art:** `hero.png` / `hero_dark.png`.

## Pages

| Route | Role |
| --- | --- |
| `/` | Hero, What’s inside, Programmes, mock exam teaser |
| `/features` | Longer feature list |
| `/programmes/computing` | Computing explorer (year × semester → modules) |

Header (sticky) and footer on all pages. Nav: Features, Programmes, About.

## Programmes (landing)

- Eyebrow **Explore programmes**.
- Desktop heading: “Your degree. Your goals. Your next level.”
- Mobile heading: “Your next level.” Hide the long lede, meta chips, and coming-soon blurbs.
- **Featured:** BSc Computing, “Available now”, Explore programme (real destination).
- **More paths:** four coming-soon groups (not fake course links).
- Silver sweep on the featured card (hover desktop, press mobile). Honor `prefers-reduced-motion`.

## Computing page

Year chips and semester chips (44px tap targets). Default **Year 2 · Semester 1** (the curriculum we have). Other terms: empty state, not invented modules. Module cards do not yet open a workspace.

## Motion

CSS only for MVP. Signature effects: silver button/card sweep, staggered rise-in, looping lesson/progress art in What’s inside. Reduce or freeze under `prefers-reduced-motion`.

## Accessibility

- Skip link, button-sized targets, visible focus rings.
- Text links: 2px violet underline on hover/focus.
- Buttons (Get started, mock exam, Explore programme) are not text-underlined.
- Coming-soon programmes are not presented as available.

## Empty / error

Computing semesters without a module list show a short “not listed yet” message. Do not ship skeleton loaders until live API data exists.
