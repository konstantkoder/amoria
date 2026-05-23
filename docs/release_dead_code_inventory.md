# Release Dead Code Inventory

Updated: 2026-05-23

| File/path | Legacy/dead item | Decision | Reason |
| --- | --- | --- | --- |
| `src/config/constants.ts` | `color_mood` Together activity | remove now | Pre-public feature removed from release scope. |
| `src/together/*` | palette event/session handling | remove now | Only supported `draw` and `story_sparks` remain active. |
| `tests/together-lifecycle.test.ts` | positive `color_mood` tests | remove now | Replaced by negative validation tests. |
| `docs/*` | old text saying `color_mood` is current/legacy-readable | remove/update now | Docs must match pre-release removal decision. |
| Firebase fallback references | any active backend fallback | investigate when found | Release backend must remain standalone. |
| mock/demo/local-only paths | active success path | investigate when found | No local-only release success is allowed. |
| old Rooms/VideoChat references | non-release product surface | investigate | Do not delete blindly without route/code ownership check. |

Allowed remaining matches: negative tests and removal documentation only.
