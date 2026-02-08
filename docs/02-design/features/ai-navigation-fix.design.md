# [Design] AI Navigation & Platform Pathfinding Fix

## 1. Technical Overview
*   **Component:** AI Controller (`getAIKeys` in `useGameEngine.ts`)
*   **Key Logic:** Platform-aware horizontal movement.

## 2. Detailed Design

### 2.1 Intermediate Platform Targeting
*   **Threshold:** If target `distY < -150` (too high for direct jump).
*   **Search Logic:**
    - Iterate through `platforms`.
    - Find platforms where `p.y < aiPlayer.y` AND `p.y > opponent.y - 50`.
    - Select the nearest platform horizontally.
*   **Movement Redirection:** If a stepping-stone platform is found, override `moveLeft`/`moveRight` to target the platform's center instead of the opponent's X.

### 2.2 Corner Jump Throttling
*   **State:** Add `lastJumpTime` or check if jump is making vertical progress.
*   **Logic:** If `isCornered` and `aiPlayer.isGrounded`, only jump if target is actually above or if escaping. Prevent jumping if the player is at the same level but just "blocking".

### 2.3 Escape Refinement
*   **Logic:** When escaping a corner, prioritize moving away from the wall. If a jump occurs, ensure it carries horizontal momentum by holding the direction key longer.

## 3. Implementation Details
*   `getAIKeys` signature needs to include `platforms: Platform[]`.
*   Update `useGameEngine.ts` calls to `getAIKeys` to pass platforms.

## 4. Verification Plan
*   **Scenario:** Player on `platform-center` (y=250), AI on ground (y=480).
*   **Expected:** AI moves to `platform-left` or `platform-right` (y=350) first.
