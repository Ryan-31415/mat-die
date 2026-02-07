# [Design] AI Height-Based Logic

## 1. System Architecture
*   **Component:** Game Engine (`useGameEngine.ts`)
*   **Sub-component:** AI Controller (`getAIKeys`)

## 2. Detailed Design

### 2.1. Attack Logic Refinement
Current logic allows attacking if `distance < threshold` and `(isVerticalAligned || !canMelee)`.
**New Logic:**
*   For **Basic Attacks**: ALL characters require `isVerticalAligned` (approx < 60px diff).
    *   *Reasoning:* All basic projectiles (arrows, fireballs, snowballs) and melee attacks are horizontal.
*   For **Skills**:
    *   **Requires Alignment:** Archer, Ninja (dash), Scientist (orb), Ice Mage (Avalanche - horizontal), Reaper (Bat).
    *   **Ignores Alignment:** Mage (Large Fireball - vertical drop), Hunter (Trap - floor based, but maybe alignment matters? No, it's a trap). Gladiator (Shield - n/a).
*   For **Ultimates**:
    *   **Requires Alignment:** Archer (Shotgun), Hunter (Shotgun), Reaper (Flying contact - effectively melee).
    *   **Ignores Alignment:** Mage (Meteor), Ice Mage (Blizzard), Ninja (Clone spawn + buff), Gladiator (Buff), Scientist (Tesla Coil).

**Implementation Strategy:**
Inside `getAIKeys`:
```typescript
const isVerticalAligned = Math.abs(distY) < 60;

// ... existing code ...

// 3. Attack Logic
// ...
const requiresVertical = true; // All basic attacks
if (isReadyToAttack && (!requiresVertical || isVerticalAligned)) { ... }

// 4. Skill Logic
let skillRequiresVertical = true;
if (char.id === 'mage') skillRequiresVertical = false; // Drop
if (char.id === 'hunter') skillRequiresVertical = false; // Trap
// ... check others ...

if (canUseSkill && (!skillRequiresVertical || isVerticalAligned)) { ... }

// 5. Ultimate Logic
let ultRequiresVertical = true;
if (['mage', 'ice-mage', 'ninja', 'gladiator', 'scientist'].includes(char.id)) ultRequiresVertical = false;

if (canUseUlt && (!ultRequiresVertical || isVerticalAligned)) { ... }
```

### 2.2. Vertical Pursuit Logic
*   **Trigger:** When AI is "aggressively" trying to engage (i.e., not fleeing, distance > preferred).
*   **Logic:**
    *   `if (opponent.y < aiPlayer.y - 100)` -> Target is significantly above. -> **JUMP** (Up/W).
    *   `if (opponent.y > aiPlayer.y + 100)` -> Target is significantly below. -> **DROP** (Down/S).
*   **Integration:**
    *   Insert into "2. Movement Logic" section.
    *   Prioritize staying on arena (don't drop into void).
    *   Existing `atLeftEdge`/`atRightEdge` logic handles horizontal bounds. Vertical bounds are handled by physics, but we shouldn't press 'Down' if at bottom platform.

## 3. Data Structures
No change to `GameState` or `Player` types. Purely logic change in `getAIKeys`.

## 4. Test Plan
*   **Scenario 1:** Player stands on top platform. AI (Archer) on bottom.
    *   *Expected:* AI jumps up to same platform level before shooting.
*   **Scenario 2:** Player stands on bottom. AI (Mage) on top.
    *   *Expected:* AI casts Big Fireball (Skill) immediately (vertical ignores). AI Basic Attacks wait until AI drops down.
*   **Scenario 3:** Ninja Clone behavior.
    *   *Expected:* Clone follows same logic (inherits `getAIKeys`).

## 5. Security & Performance
*   **Performance:** Simple arithmetic checks. No impact.
*   **Security:** N/A (Client-side AI).
