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

| Route | Audience |
| --- | --- |
| `/` | Hero, What’s inside, Programmes, mock exam teaser |
| `/features` | Longer feature list |
| `/programmes/computing` | Computing explorer (year × semester → modules) |
| `/login`, `/signup`, `/forgot-password` | Auth. Staff land on `/admin`; students on `/dashboard` (or `/onboarding`) |
| `/dashboard`, `/dashboard/courses` | Student shell. My Courses lists authorised published modules |
| `/learn/lessons/[id]` | Student lesson player. `?preview=1` is staff-only and still checked on the API |
| `/admin` | Staff dashboard. Copy and stats follow the signed-in scope |
| `/admin/courses` | Assigned modules. Only program administrators and Super Admins create modules |
| `/admin/lessons` | Chapters and lessons for assigned modules only |
| `/admin/lessons/[id]/edit` | Typed slide/block editor. Creators **submit for review**; admins **publish** |
| `/admin/assignments` | Super Admin assigns program administrators and creators. Program administrators assign creators inside their programmes |

Marketing pages keep the sticky header and footer (Features, Programmes, About). Student and staff apps use `AppShell` side navigation. Staff items such as Students and Assignments are hidden unless the loaded scope allows them. Module pickers label options as `programme · code — name` so the same module title in two programmes is not ambiguous.

## Programmes (landing)

- Eyebrow **Explore programmes**.
- Desktop heading: “Your degree. Your goals. Your next level.”
- Mobile heading: “Your next level.” Hide the long lede, meta chips, and coming-soon blurbs.
- **Featured:** BSc Computing, “Available now”, Explore programme (real destination).
- **More paths:** four coming-soon groups (not fake course links).
- Silver sweep on the featured card (hover desktop, press mobile). Honor `prefers-reduced-motion`.

## Computing page

Year chips and semester chips (44px tap targets). Default **Year 2 · Semester 1** (the curriculum we have). Other terms: empty state, not invented modules. Signed-in students open published lessons from My Courses, not from this marketing explorer.

## Motion

CSS only for MVP. Signature effects: silver button/card sweep, staggered rise-in, looping lesson/progress art in What’s inside. Reduce or freeze under `prefers-reduced-motion`.

## Accessibility

- Skip link, button-sized targets, visible focus rings.
- Text links: 2px violet underline on hover/focus.
- Buttons (Get started, mock exam, Explore programme) are not text-underlined.
- Coming-soon programmes are not presented as available.

## Empty / error

Computing semesters without a module list show a short “not listed yet” message. Staff with no assignments see empty module lists, not the full catalogue. Forbidden CMS routes return the API error in place rather than leaking another programme’s content.
