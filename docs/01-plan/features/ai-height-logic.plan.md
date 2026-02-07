# [Plan] AI Height-Based Logic

## 1. Overview
**Feature Name:** AI Height-Based Logic
**Goal:** Improve AI (and Clone) decision-making to account for vertical positioning relative to the opponent.
**Trigger:** User request for smarter AI that aligns vertically before attacking and chases vertically.

## 2. Problem Statement
*   Current AI attacks regardless of vertical alignment for ranged characters, leading to missed shots.
*   AI does not actively try to change its Y-position (Jump/Drop) to match the opponent, making it easily exploitable by staying on a different platform level.

## 3. Requirements
### Functional
1.  **Attack Condition:**
    *   AI MUST NOT fire horizontal projectiles if the vertical distance to target is too large (e.g., > 60px).
    *   **Exceptions:**
        *   Mage (Wizard): Skill (Large Fireball - drops down), Ultimate (Meteor - drops down).
        *   Ice Mage: Ultimate (Blizzard - global).
        *   (Check other characters for non-horizontal attacks).
2.  **Movement Logic:**
    *   If AI wants to engage and is vertically misaligned:
        *   Target above -> Jump (`ArrowUp` / `W`).
        *   Target below -> Drop (`ArrowDown` / `S`).
    *   Must consider platform mechanics (only drop if on platform).

### Non-Functional
*   Performance: Calculations should be lightweight (inside game loop).
*   Experience: AI should feel more "human-like" in tracking.

## 4. Architecture Impact
*   **File:** `src/hooks/useGameEngine.ts`
*   **Function:** `getAIKeys`
*   **New Helper:** May need a helper to determine if a character's specific attack/skill/ult is vertical-independent.

## 5. Risk Assessment
*   **Risk:** AI might get stuck jumping/dropping if target oscillates quickly.
    *   *Mitigation:* Use existing `decisionSeed` / `stableRandom` to prevent jittery inputs.
*   **Risk:** AI might jump into hazards.
    *   *Mitigation:* Existing hazard avoidance logic is high priority, so it should override pursuit.

## 6. Tasks
- [ ] Create Design Document
- [ ] Refactor `getAIKeys` to identify vertical-independent attacks.
- [ ] Implement vertical alignment check for attacks.
- [ ] Implement vertical pursuit (Jump/Drop) logic.
- [ ] Verify with gameplay test.
