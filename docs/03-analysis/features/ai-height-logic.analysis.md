# [Analysis] AI Height-Based Logic

## 1. Summary
**Feature:** AI Height-Based Logic
**Status:** Implemented
**Match Rate:** 100%

## 2. Requirement Verification
| Requirement | Status | Implementation Details |
|-------------|--------|------------------------|
| AI checks vertical alignment for Basic Attacks | ✅ | Enforced `isVerticalAligned` in `isReadyToAttack`. |
| Exceptions for Non-Horizontal Skills | ✅ | Added exception checks for Mage (Skill), Hunter (Trap), Gladiator (Shield). |
| Exceptions for Non-Horizontal Ults | ✅ | Added exception checks for Mage, Ice Mage, Ninja, Gladiator, Scientist. |
| Vertical Pursuit (Jump/Drop) | ✅ | Added logic to Jump if `distY < -80` and Drop if `distY > 80`. |
| Applies to Ninja Clone | ✅ | `getAIKeys` is shared by main AI and Clones. |

## 3. Code Analysis
*   **File:** `src/hooks/useGameEngine.ts`
*   **Logic:**
    *   Added `jump` and `drop` variables to state.
    *   Refactored attack conditions to be stricter on alignment.
    *   Integrated vertical movement into the key generation.

## 4. Conclusion
The implementation fully meets the specified requirements. The AI now respects verticality in combat, making it smarter and fairer in 1v1 scenarios.
