# AMORIA FINAL V5 — ONE-FILE ASSET PACK

This is the only current package for implementation.

## Source-of-truth hierarchy

1. Runtime files under `assets/**`, `src/assets/**` and `admin-web/public/activity-art/**` are the exact implementation assets.
2. `design-assets/references/06_together_prompt_illustrations_v5.png` and `07_together_prompt_system_v5.png` define the approved drawing-prompt direction.
3. `design-assets/references/01_start_new.png` through `05_profile_onyx.png` define the approved individual screens.
4. `09_user_reference_bridge_city_board_a.png` and `10_user_reference_bridge_city_board_b.png` reinforce the exact bridge/city atmosphere.
5. Other boards are overview/reference-only.

## Non-negotiable rules

- Never load files under `design-assets/references/` in production runtime.
- Do not crop production assets from a reference board.
- Do not bring demo names, distances, member counts or fake profiles into production.
- Prompt illustrations are local, exact and mapped by existing prompt key.
- The four V5 prompt JPEGs replace all earlier sepia/sketch prompt art.
- Prompt art appears before the canvas and optionally in a compact reference strip; the canvas itself remains clean.
- Nearby activity covers are local and mapped by `activityKey` / `typeKey`.
- Unknown/custom activity types use `default.jpg`.
- Artwork is visual-only: do not add image fields to API, DTO, database, migrations or admin payloads.
- Mobile and admin-web intentionally contain separate copies of activity art because they are implemented on different release branches and bundlers.
