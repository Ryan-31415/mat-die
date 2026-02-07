# [Design] AI Corner Escape & Hazard Avoidance

## 1. Technical Overview
*   **Component:** AI Controller (`getAIKeys` in `useGameEngine.ts`)
*   **Scope:** Movement and Threat Detection logic.

## 2. Detailed Design

### 2.1 Corner Escape Logic
*   **State Detection:** 
    - `atLeftEdge`: AI X < padding + 60
    - `atRightEdge`: AI X > width - padding - size - 60
    - `isCornered`: (atLeftEdge AND player is to the right AND dist < 250) OR (atRightEdge AND player is to the left AND dist < 250)
*   **Action:** If `isCornered` and character is NOT melee (`!canMelee`), set `jump = true` and move towards center.

### 2.2 Tesla Coil Awareness
*   **Detection:** In `isHazardThreat`, if hazard type is `tesla-coil`, use distance check: `dist < (h.attackRange || 210) + 50`.
*   **Dodging:** 
    - Calculate `escapeDirection` based on `nearestHazard` center X.
    - If `playerCenterX > hazardCenterX`, move right, else move left.

## 3. Verification Plan
*   **Manual Test:** Play as Scientist, place Tesla Coil, observe AI behavior.
*   **Manual Test:** Corner a long-range AI (e.g., Archer) at the edge of the arena and see if it jumps to escape.
