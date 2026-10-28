# Frontline outpost core overhaul

User selected A concept + core overhaul: restrained outpost defense, contextual/collapsible UI, stronger economy, changing waves, tower specialization and run tactics. Implement this approved combination inline with parallel rules/world tasks; no purchase or deployment.

## Scope and design

- Title 경계선: 최후의 전초기지. Replace household language, weapons, enemies and HQ appearance with commander/infantry/gatling/mortar/cryo/support artillery. Reuse licensed local assets and retain fixed-angle camera, pan/pinch, high-DPR/MSAA and movement-facing behavior.
- One top HUD: resources, integrity, wave + contextual next-wave intelligence. One bottom dock: support skill, 1×/2×, start wave, command panel. No zoom percentage/buttons or construction-management toggle. Camera reset, commander upgrade, repair, sound, pause, help and new operation live in collapsed command panel. Build and upgrade sheets open only on battlefield selection.
- Starting resources 300, early enemy totals 24/30/38/46/60, distributed spawning capped at32 alive, varied swarm/scout/armor/mixed profiles and boss waves. More frequent useful spending; early trash should die quickly. Keep20 waves, distinguish first5; inspect with simulation before claiming balance.
- Three existing tower keys retain save compatibility; at level3 each gets a one-time free specialization with distinct behavior and visible geometry. Add75% sale refund, actual stats and costs in sheet.
- Every3 completed waves choose one of3 stable offers; effects can stack within limits and differ per seeded run. Save the choices; block starting until a pending choice is resolved. Migrate saves1–4 to5 with validation, no progress reset.

## Work

- [x] Game rules, migration, effects and deterministic tests — scoped rules agent owns game.ts/game.test.ts.
- [x] Military 3D models, aiming integration and geometry tests — scoped world agent owns renderer/model files and corresponding tests.
- [x] Replace scattered main.tsx UI and CSS with compact accessible contextual panels; implement tactics choice and clear/reward feedback; update title/help/readme.
- [x] Full test/build; isolated browser first5-wave progression, branching/tactics/selling/persistence, mobile and desktop accessibility/layout/render checks; independent review and fixes.
- [x] Update preview and stop temporary server. Preserve personal .idea files. No auto commit/push/deploy.

## Review focus

Tactics must be real combat effects, not labels; pending choice must not softlock saved games; branches cannot be changed/refunded for profit; UI stats must match combat; never hide keyboard/mobile essentials; sheets cannot block the command dock or joystick; no loss of old saves; density must stay within mobile active-unit budget. Real-device FPS/heat and subjective replay enjoyment require later playtesting.


## Verification results

- 59/59 tests pass, including earned-resource20-wave victory, undefended defeat, all branches/tactics, migration, facing, gear batching and same-level branch renderer rebuild/disposal.
- TypeScript and production Vite build pass. Existing Three.js chunk warning remains.
- Isolated Chromium contexts verified keyboard pad selection, native Space activation, build/upgrade/specialize/sell, reload persistence, three tactic offers and pending-choice resolution, planning pause/resume and explicit pause/resume.
- Viewports320×568,390×844,844×390 and1440×1000: no horizontal overflow; modals remain on screen and focus trapped; build panels end above dock.
- First5-wave in-memory browser simulation used only earned resources:24/30/38/46/60 enemies; all five cleared. Human enjoyment and late-wave difficulty still need playtesting.
- Review findings fixed: restored accessible construction selection and native select keyboard handling; explicit planning pause while sheets obscure mobile movement. Equipment reduced to three rigid attachment draw calls per character.
- Previous saves retained; personal .idea untouched. Preview updated. No commit, push or deployment requested for this implementation.
- Real-device FPS/temperature and subjective replay appeal remain unverified.
