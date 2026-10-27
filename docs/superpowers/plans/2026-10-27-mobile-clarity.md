# Mobile clarity and zoom implementation plan

User approved stages 1–2 of the diagnosis: fix surface conflicts, render resolution, antialiasing and shadows; expand zoom and improve the initial mobile view. Model replacement remains out of scope.

Use existing Three.js and controls, no dependencies or save changes. Keep the current checkout and personal .idea files intact. Test with a temporary local server, then stop it.

- [x] Add failing tests for 100–500% limits, mobile 170% initial/reset view, camera depth precision, non-overlapping ground, and renderer/composer pixel-ratio synchronization.
- [x] Remove the redundant lawn overlay; fit camera clipping planes around the battlefield. Raise rendering to native DPR up to 3 with a 3-million-pixel budget; use 4× MSAA in composer render targets (clamped to GPU support).
- [x] Use 2048 shadows on mobile too, disable mobile bloom to reserve rendering budget for clarity, preserve fixed-angle pan/pinch and all map/build/animation contracts.
- [x] Update zoom documentation; run full tests/build, inspect DPR 3 mobile and desktop screenshots at default and maximum zoom, verify rendering and gestures, request focused review.

Risks to check: postprocessing targets must share DPR after resize, MSAA must work with SSAO/output, small surfaces must remain separated, maximum zoom may expose existing model limits, and native-device FPS/heat cannot be inferred from desktop emulation.

Verification: 44 tests pass; production build passes with existing Three.js chunk-size advisory. DPR 3 mobile viewport 390×844 renders 1170×2532; actual offscreen GL samples = 4; shadows = 2048²; mobile AO/bloom disabled. UI checks: 500% maximum, 100% minimum, 170% mobile reset, pan/build/wave start, no horizontal overflow. Desktop/mobile resizing and SSAO clipping uniforms verified with real WebGL, GL error 0. Reviewer found stale SSAO near/far uniforms; regression reproduced with a real SSAOPass and fixed. Screenshots: test-results/mobile-clarity-default.png, mobile-clarity-500.png, mobile-clarity-play.png, clarity-desktop.png. Real mobile GPU performance and heat remain unmeasured. No model replacement or deployment performed.
