# Release Dead Code Inventory

Updated: 2026-05-23

| File/path | Legacy/dead item | Decision | Reason |
| --- | --- | --- | --- |
| `src/screens/PlayColorMoodScreen.tsx` | active color mood screen | remove now | Pre-public Together scenario removed from release. |
| `src/services/togetherPaletteState.ts` | color mood palette parser/state | remove now | Used only by removed color mood runtime. |
| `src/navigation/*` | `PlayColorMood` route | remove now | No active route should create or recover color mood. |
| `src/screens/PlayMatchScreen.tsx` | accepting removed activity | remove now | Unknown/removed activities must show fallback and report Client Error. |
| `src/screens/PlayResultScreen.tsx`, `PlaySessionDetailScreen.tsx`, `PlayHistoryScreen.tsx` | active color mood render paths | remove now | Keep generic unsupported fallback only. |
| `src/i18n/locales/*` | active color mood text keys | remove now | No active UI text should mention removed feature. |
| `src/theme/theme.ts` | `MoodPalette` profile mood theme | keep | Unrelated to Together color mood; powers profile mood styling. |
| `docs/*` | old “legacy color_mood readable” wording | update now | Public release has no compatibility obligation for pre-release rows. |
| Firebase references | active fallback paths | investigate | Release must stay backend-first with no Firebase fallback. |
| mock/demo/local-only paths | release success paths | investigate | No local-only success is allowed. |
| old Rooms/VideoChat references | old product surface | investigate | Do not delete unrelated history blindly; verify route/import ownership first. |

Search rule: remaining `color_mood` / `PlayColorMood` matches should be limited to removal documentation or negative tests. Remaining `palette` matches must either be removal documentation or unrelated profile mood/theme language.
