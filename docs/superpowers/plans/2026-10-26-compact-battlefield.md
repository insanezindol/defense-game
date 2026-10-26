# Compact Battlefield Implementation Plan

> Execute in the current checkout with test-driven changes.

**Goal:** Narrow the three interior grass strips, center their towers for attacks on both roads, and set enemy HP multipliers to 20/30/40.

**Architecture:** Keep the shared road samples as the source for movement and rendering. Use road rows at -17, -7, 3, 13 with radius-5 bends, interior pads at -12, -2, 8, and move the home with the road endpoint. Keep the existing board and camera bounds. Save version 3 distinguishes the old road geometry; project version-2 positions onto the compressed road when restoring.

**Tech Stack:** TypeScript, Three.js, node:test.

## Approved scope
- Keep 24 pads, tower stats, rewards, enemy counts and speeds.
- Easy 20, Normal 30, Hard 40 enemy HP multipliers.
- Preserve saved gold, waves, tower indices and levels; active saved enemies retain HP.

## Tasks
- [x] Add tests for centered pads, both road directions with all tower types, exact difficulty scaling, and old-save migration; confirm failures.
- [x] Update battlefield geometry, difficulty constants and save migration. Update the old strategy test whose guaranteed victory conflicts with increased difficulty.
- [x] Run the full test suite and production build. Browser visual inspection attempted through Playwright and the in-app browser; both timed out connecting to the local dev server.

## Execution notes
- The former passive strategy now loses on wave 2; keep its loss coverage and separately verify that clearing wave 20 wins.
- Existing active enemies keep their saved HP; newly spawned enemies use the new multipliers.
- No dependency, tower-stat, reward, count, speed or camera changes.

## Review focus
Road clearance at bend endpoints; minimum tower range and enemy lane offsets; legacy version-1 conversion; version-2 active enemy position; round-trip version-3 saves.
