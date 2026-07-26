# Amoria V5 — Together drawing prompt artwork map

These four files are the final approved local illustrations. Do not regenerate or substitute them.

| Existing prompt key | Runtime asset | Visual |
|---|---|---|
| `draw.tinyPlace` | `src/assets/together/prompts/draw_tiny_place.jpg` | Warm private balcony table above a night city |
| `draw.firstMeeting` | `src/assets/together/prompts/draw_first_meeting.jpg` | Rainy old-European café street at night |
| `draw.dreamRoom` | `src/assets/together/prompts/draw_dream_room.jpg` | Quiet warm room with panoramic night window |
| unknown / missing | `src/assets/together/prompts/draw_default.jpg` | Abstract golden sparks over dark water and sky |

Rules:

- Static local `require()` only.
- Use existing `getTogetherPromptKey(source)`.
- The illustration appears in the pre-canvas preview and optional compact reference strip.
- Never use it as the drawing canvas background.
- Do not add image fields to API/DTO/database.
- Do not extract/crop production assets from the reference boards; use the four runtime files above.
