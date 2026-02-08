# [Plan] AI Navigation & Platform Pathfinding Fix

**Feature Name:** AI Navigation & Platform Pathfinding Fix
**Goal:** Prevent AI from stuck jumping in corners and implement smarter platform navigation when targets are too high.

## 1. Problem Definition
*   **Corner Jumping Loop:** AI repeatedly jumps in corners when trying to escape or reach a player, leading to predictable and ineffective behavior.
*   **Vertical Reach Limit:** AI tries to jump directly to a target even if the platform is too high to reach with a single/double jump.
*   **Pathfinding Lack:** AI doesn't consider side platforms as intermediate steps to reach higher elevations.

## 2. Proposed Changes
*   **Corner Jump Dampening:** Add a cooldown or logic check to prevent continuous jumping at edges unless a valid platform is detected above.
*   **Intermediate Platform Navigation:** 
    - If `distY < -150` (target is very high), search for nearby platforms that are at a lower elevation than the target but higher than the AI.
    - AI should move toward these "stepping stone" platforms instead of directly toward the opponent's X position.
*   **Escape Logic Refinement:** Improve corner escape to prioritize horizontal repositioning over vertical spam.

## 3. Implementation Plan
- [ ] Research current platform accessibility in `useGameEngine.ts`.
- [ ] Implement `findSteppingStone` helper in AI logic.
- [ ] Refactor movement logic to target intermediate platforms when necessary.
- [ ] Add corner jumping throttle.

## 4. Success Criteria
*   AI stops jumping repeatedly at the edges when not making progress.
*   AI uses side platforms to reach a target on the highest center platform.
*   AI feels more "intelligent" in navigating the arena layout.
