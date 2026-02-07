# [Plan] AI Corner Escape & Hazard Avoidance

**Feature Name:** AI Corner Escape & Hazard Avoidance
**Goal:** Improve AI survival by escaping corners and avoiding long-range hazards (Tesla Coil).

## 1. Problem Definition
*   **Cornering:** Long-range AI characters get stuck at arena edges when approached by the player, making them easy targets.
*   **Tesla Coil:** AI only avoids hazards when in direct contact, but the Scientist's Tesla Coil has a large attack range that AI ignores until it's too late.

## 2. Proposed Changes
*   **Corner Escape:**
    - Detect if AI is at an edge and the opponent is close.
    - If AI is a long-range character, trigger a jump to escape over/past the opponent.
*   **Hazard Avoidance:**
    - Update AI threat detection to account for the Tesla Coil's `attackRange`.
    - Improve dodging logic to move away from the center of the nearest hazard.

## 3. Implementation Plan
- [x] Refactor `getAIKeys` to move `canMelee` definition up.
- [x] Update `isHazardThreat` logic for Tesla Coil range.
- [x] Implement `isCornered` detection and jump-based escape.
- [x] Improve dodge direction calculation based on hazard center.

## 4. Success Criteria
*   AI jumps when cornered at edges by a player.
*   AI stays outside the Tesla Coil's attack range (approx. 210px).
