# [Report] AI Height-Based Logic

## 1. Overview
**Feature:** AI Height-Based Logic
**Date:** 2026-02-06
**Status:** Completed

## 2. Executive Summary
The AI logic has been upgraded to fully support vertical combat awareness. AI agents (including Ninja clones) now actively align vertically with their targets before firing horizontal projectiles and will jump or drop through platforms to pursue opponents at different elevations.

## 3. Key Changes
*   **Vertical Alignment Check:** Prevents AI from wasting attacks when the target is at a different height.
*   **Vertical Pursuit:** AI proactively adjusts its height to engage the target.
*   **Exceptions:** Logic correctly handles vertical/global skills (Mage Fireball/Meteor, Ice Mage Blizzard, etc.) allowing them to be used regardless of alignment.

## 4. verification Results
*   **Functional Requirements:** All Met.
*   **Code Quality:** Consistent with existing `useGameEngine` patterns.

## 5. Next Steps
*   Monitor AI behavior in complex platforming scenarios (e.g., very high platforms) to ensure it doesn't get stuck.
