# Shorter road, authored models and rendering costs

User approved removing the top road only and stages 3–4 of the graphics proposal. Retain the lower road coordinates and existing high-DPR/MSAA/zoom work. Remove the six stranded top pads; migrate saves and refund their invested upgrades.

Implementation uses CC0 Kenney authored GLB residents with walk/idle/attack clips, normalized proportions and the household broom. Bundle only selected models and licenses locally. Retain procedural enemies and defenses. Upgrade the primary residential buildings using authored suburban models while retaining decorative local props and keeping the battle clear. Asset failures preserve the playable procedural scene.

Reduce repeated rendering work: reuse loaded geometry/materials and independent cloned skeletons; cap shadow refresh at 30Hz and avoid redundant shadow passes while keeping moving actors responsive. Preserve loading/disposal behavior, save state, fixed-angle pan and 100–500% zoom.

- [x] Shorten road, migrate v1–v3 saves to v4, update path/defense regressions (delegated scoped agent).
- [x] Inspect and bundle selected licensed assets, add asset loading/animation/disposal tests, integrate residents and upgraded homes.
- [x] Add shadow refresh regression checks, measure representative draw/triangle/shadow work, verify mobile and desktop renders and full gameplay suite.
- [x] Review all changes, update README/preview and stop temporary local server. No automatic deployment or purchase.

Verification: 50 tests and production build pass. The retained 369 road points match the previous suffix exactly; v3 curved lane positions and refund/idempotency tests pass. Authored assets total less than 0.9 MB plus licenses; mesh sharing, independent skeletons, safe removal and normalized lots tested. Isolated browser loaded the models, showed 18 construction sites, and played the shortened road in desktop/mobile viewports. Model-fetch failure preserves play; loading after World disposal does not attach resources. Representative 20-enemy, 60-frame desktop self-check: legacy auto-shadow work 39,960 render calls / 22,434,540 triangles; cached shadow path 25,470 calls / 13,943,580 triangles; GL error 0. This is rendering-work measurement, not mobile FPS. Mobile hardware, heat, deployment are not tested.

Review: one P2 fixed — transfer the existing attack-range aura to the authored hero before removing the procedural hero. Browser self-check first reproduced zero rings after loading, then passed ownership after transfer. Final mobile DPR3 capture uses 1170×2532 and has no page runtime errors. Updated gameplay.png. Temporary server stopped after verification; no commit or deployment.
