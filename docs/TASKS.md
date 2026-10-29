# Pending tasks (prioritised)

## P0 — validate with people and hardware
1. **Physical playtest**: 1 TV/PC + 2, 3 and 4 real phones (Android Chrome + iOS Safari) on a home
   Wi-Fi. Record: join time, input latency feel, disconnections, readability from the sofa.
2. **Measure FPS** on a mid laptop iGPU and on a TV browser (Options → show FPS). Tune default
   quality preset per measurement.
3. **Balance pass** from playtest data: order intervals, patience, star thresholds per player count.
4. Listen to all music/SFX on speakers; fix levels/mix.

## P1 — art production (replace provisional procedural assets, keep interfaces)
5. Blender → GLB pipeline: loader with fallback to procedural builder, scale/pivot conventions, Draco/
   meshopt compression, texture atlases (see ASSETS.md "Production priorities").
6. Skinned chef characters (rig + idle/walk/run/carry/chop/stir/serve/celebrate/sad clips).
7. Hero props: grill, stone oven, wok, pot, serve pass; food hero items.
8. PBR maps for floors/walls/counters; contact-shadow pass.

## P2 — content & features
9. Cosmetic unlocks (hats/aprons/colours) earned by stars; chef customisation screen.
10. New mechanics: dish-washing (dirty plates + sink), moving hazards (delivery cart), conveyor.
11. Fourth restaurant (desserts) with the pending ingredients (eggs, flour, chocolate, cream, ice cream, fruit).
12. Contextual tutorial overlay for level 1 (step-by-step on the TV, synced with phone hints).
13. Per-player stats screen and best-score history per player count.

## P3 — platform
14. Server build step (esbuild) + Dockerfile; optional Redis for room directory if scaling out.
15. Heartbeat/dead-socket integration test; load test with N simulated rooms to document capacity.
16. WCAG contrast measurement and screen-reader pass on menus.
