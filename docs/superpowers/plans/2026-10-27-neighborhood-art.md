# Neighborhood art implementation plan

> Execute inline using executing-plans; the user selected POLYGON Town styling with Littlest Tokyo background density and authorized implementation.

**Goal:** Replace the sparse toy scene with a detailed original low-poly residential neighborhood; preserve pan and zoom, remove rotation.
**Architecture:** Keep Three.js, the existing shared map, GPU character rig and static scenery batching. Build original geometry rather than purchasing or copying commercial assets. Keep the combat lanes and build sites clear.
**Scope:** camera-controls.ts and its tests; world-models.ts character geometry; a focused neighborhood.ts scenery builder and geometry checks; world.ts integration/lighting; main.tsx control instructions; README and preview screenshot. No gameplay/save/schema/dependency changes.

- [x] Replace orbit expectations with fixed-angle pointer regression tests, watch failures, then remove rotation and use two-finger pan plus pinch.
- [x] Add scenery self-checks for finite geometry, dense architectural detail, bounded size and clear battle lanes. Build gabled homes, storefronts, faceted trees, street furniture and parked cars using shared materials.
- [x] Update human silhouettes, clothing and faceted faces while preserving named animation bones, weapons and batching.
- [x] Integrate scenery and stronger warm/cool lighting; update instructions and README.
- [x] Run the full test suite and production build; inspect desktop and narrow viewport screenshots and browser errors; review diff.

Review focus: multi-touch must never select a building; right drag must never rotate; zoom anchor/reset/resize remain intact; scenery must not hide construction sites or enter combat lanes; material/geometry disposal and batching must remain intact. Mobile real-device frame rate is outside local browser verification.

Verification: 39 Node tests passed; production build passed (existing Three.js chunk-size advisory remains). Desktop 1440×1000 and mobile 390×844 screenshots inspected, no horizontal overflow. Constructed two defenses and played wave 1 in an isolated browser context, leaving the original context save intact. Browser render errors: none after batching fix. A real WebGL self-check reproduced stale SSAO projections, then passed zoom 2/0.65/2.5, reset and mobile AO disabling after the fix. Review: one P2 AO projection issue fixed; no other definite findings. No purchase or deployment performed.
