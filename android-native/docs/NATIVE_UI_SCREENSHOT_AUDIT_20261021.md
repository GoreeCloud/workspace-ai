# Workspace AI Native Android — Screenshot-led UI Review
**Date:** October 21, 2026  
**Scope:** Development-only native Android Activity in draft PR #69. Not a visual approval, signed release, or connected AI product.

## Source of comparison

- The owner explicitly rejected the earlier generic Android Views placeholder.
- The verified Workspace AI web consumer palette from `src/ui-refresh.css` (PR #66) includes brand `#5145D9`, primary ink `#20243A`, soft text `#5F657B`, and raised surfaces.
- We do **not** assume the existence of any named design system that the owner has denied.
- Screenshot evidence is an **isolated Android 35 Pixel 6 emulator**, 1080 × 2400, with no user accounts or imported data. Screenshots are available as the short-lived `native-android-synthetic-ui-screenshots` artifact from [emulator run #39710032023](https://github.com/GoreeCloud/workspace-ai/actions/runs/39710032023).

## Screen-by-screen findings from the captured build

| Screen | Verified observation | Remaining quality action |
| --- | --- | --- |
| Chat | Brand hierarchy, gradient welcome section, functional draft suggestion cards, and separate composer are present | Avoid making the hero more dominant than the workspace; continue balancing content as real messaging arrives |
| Navigation on all tabs | Three outlined tile-like tab surfaces; icons visually centered but labels shifted toward the left edge | Correct the label measurement/gravity and change navigation to a single clean bar with an active-state surface |
| Draft suggestions | Starter prompts displayed upwards arrows that resemble the disabled Send affordance | Use a right chevron to signify opening/filling a local draft, preserving disabled actual sending |
| Projects | Clear offline empty state; significant unused canvas under a central card | Reassess responsive empty-state placement and useful native project affordances once real storage exists |
| Settings | Connection/Privacy/Appearance facts are readable, About action exists | Do not make decorative settings controls imply editability; support user-system theme and accessibility after the present QA milestone |
| Composer + keyboard | Editor and disabled send stay visible above Android's soft keyboard; bottom navigation hides | Preserve keyboard inset and focus behavior and test longer multiline drafts |

## Fixes implemented following inspection

- Native bottom-tab labels now use explicit `WRAP_CONTENT` parameters with centered text; the bottom navigation no longer renders three unnecessary outlines.
- Starter suggestion cards now use a native-drawn **right chevron**, visually distinct from the disabled upward Send arrow.
- The editor's focused keyboard is dismissed when moving away from Chat; selected tabs expose accessible state descriptions.
- Page headings and changing content panes expose Android accessibility semantics where OS APIs permit.

These changes are source/CI candidates until the **post-fix** emulator screenshots are inspected. Earlier captures do not establish their rendering.

## Still required before visual acceptance

1. Collect and review updated emulator captures after the navigation fixes.
2. Test appearance on physical Android 16 hardware when an authorized device-install path is available; never bypass device installation safety restrictions.
3. Audit TalkBack, large font settings, dark theme, landscape, touch-target sizing, and navigation/IME lifecycle.
4. Compare any owner-provided screen-specific reference against the implementation; obtain the owner's actual approval.
5. Keep AI sending disabled until secure auth/backend integration works. Do not merge or promote this visual candidate as a finished application.

**Security:** All captures are from synthetic UI in a disposable emulator. No production services, live credentials, or user data were used.
