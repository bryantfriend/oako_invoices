# AGENTS.md

# Project Guidance for Codex

This project follows Bryant's ICF architecture:

**Intent + Context + Flow**

ICF is the main architecture pattern for important user actions, admin actions, student actions, player actions, system workflows, and business logic.

Before modifying major behavior, read:

- `docs/ICF.md`

---

# Core Working Rules

- Preserve existing working behavior unless explicitly asked to refactor.
- Prefer small, safe, testable changes.
- Do not remove legacy logic without explaining why.
- Do not introduce destructive Firebase migrations without a migration plan.
- Use clear comments around risky logic, compatibility layers, and authorization rules.
- When unsure, explain the risk and choose the safest implementation path.
- Prefer boring, readable, predictable code over clever code.
- Avoid large rewrites unless specifically requested.
- Keep changes focused on the requested task.
- Do not touch legacy code unless it is required for the requested change or a clearly justified refactor.

---

# Required Code Style

All code should be easy to understand and follow.

Use:

- Traditional named functions
- Clear variable names
- Explicit helper functions
- Clear stage separation
- Simple conditionals
- Predictable return shapes
- Comments for important business rules
- Comments for compatibility logic
- Comments for authorization decisions

Do not use:

- Arrow functions
- Optional chaining
- Nullish coalescing
- Crypto API
- Clever shortcuts
- Dense one-line logic
- Hidden side effects
- Unclear abbreviations
- Overly compact code

Do not write code like this:

```js
const getName = (user) => user?.profile?.name ?? "Unknown";
```

Write code like this instead:

```js
function getUserName(user) {
  if (!user) {
    return "Unknown";
  }

  if (!user.profile) {
    return "Unknown";
  }

  if (!user.profile.name) {
    return "Unknown";
  }

  return user.profile.name;
}
```

---

# ICF Usage Rule

Do not implement important user, admin, student, player, or system actions as scattered direct function calls.

When a feature represents a meaningful action, model it as an Intent and pass it through the ICF pipeline described in `docs/ICF.md`.

Examples:

- `CreateProductIntent`
- `UpdateProductIntent`
- `DeleteProductIntent`
- `UpdateInventoryIntent`
- `PlaceOrderIntent`
- `UpdateOrderStatusIntent`
- `CompleteInvoiceIntent`
- `SyncCompletedInvoiceIntent`
- `SelectStoreIntent`
- `CreateStoreIntent`
- `SubmitAnswerIntent`
- `CompleteModuleIntent`
- `UnlockModuleIntent`
- `AddHiddenMarkerIntent`
- `TriggerBypassIntent`
- `PickupItemIntent`
- `AttackIntent`
- `EquipItemIntent`
- `UseAbilityIntent`

---

# Before Building a Feature

Before coding, identify:

- What Intent is being created or modified?
- Who is the actor?
- What payload is required?
- What context must be added?
- What authorization is required?
- What state changes happen in Process?
- What should be emitted afterward?
- Which existing behavior must be preserved?
- Which files are likely to be affected?
- What is the safest implementation path?

Do not begin large refactors without first explaining the plan.

---

# File Organization Expectations

When creating or refactoring ICF code:

- Keep each Intent in its own file.
- Keep each validator in its own file.
- Keep each normalizer in its own file.
- Keep each context provider in its own file.
- Keep each authorizer in its own file.
- Keep each processor in its own file.
- Keep each emitter in its own file.
- Register stage files through clear base registries.
- Import named stage helpers from the base registry files.

Preferred pattern:

```js
import validators from "./validators.js";
import normalizers from "./normalizers.js";
import contextProviders from "./contextProviders.js";
import authorizers from "./authorizers.js";
import processors from "./processors.js";
import emitters from "./emitters.js";
```

Example usage:

```js
var createProductIntent = {
  type: "CreateProductIntent",
  validate: validators.validateCreateProduct,
  normalize: normalizers.normalizeCreateProduct,
  addContext: contextProviders.addCreateProductContext,
  authorize: authorizers.authorizeCreateProduct,
  process: processors.processCreateProduct,
  emit: emitters.emitCreateProductResult
};
```

---

# Firebase Rules

For Firebase apps:

- Store-specific data should include `storeId`.
- Superadmins may select or switch store context.
- Store admins must only access their assigned store.
- Existing Kyrgyz Organics data must remain compatible.
- Avoid destructive migrations.
- Before changing Firestore structure, produce a migration plan.
- Keep Firebase security rules aligned with ICF authorization logic.
- Avoid trusting client-provided `storeId` unless verified.
- Preserve existing document compatibility where practical.
- Use clear helper functions for Firestore reads and writes.

---

# Multi-Store Rules

For Oako-style multi-store apps:

## Superadmin

Superadmin can:

- Create stores
- Select active store
- View all stores
- Manage store settings
- Manage subscription levels
- Manage store admins
- View platform analytics

## Store Admin

Store admin can:

- Manage products for assigned store
- Manage categories for assigned store
- Manage banners for assigned store
- View orders for assigned store
- View analytics for assigned store

Store admin cannot:

- Access another store's data
- Change platform-level settings
- Change another store's subscription
- Edit another store's users
- Bypass store limits

---

# Lesson App Rules

For student lesson systems:

- Student progress changes should usually be represented as Intents.
- Completion markers must be validated before unlocking progress.
- Hidden markers should not automatically unlock progress without validation.
- Bypass timers should be intentional and logged where practical.
- XP changes should be handled predictably.
- Keep young-student interfaces visual, simple, and low-text.
- Use Emit for confetti, sounds, XP messages, and completion screens.
- Avoid teacher-dependent flows where the system can safely guide the student.

Important lesson Intents may include:

- `StartLessonIntent`
- `SubmitAnswerIntent`
- `AddHiddenMarkerIntent`
- `CompleteModuleIntent`
- `UnlockNextModuleIntent`
- `TriggerBypassIntent`
- `AwardXPIntent`

---

# Roblox / Game Rules

For Roblox or game systems:

- Player and NPC actions that affect game state should usually be Intents.
- Validate important actions on the server.
- Do not trust the client with important state.
- Add cooldowns or rate limits for high-frequency Intents.
- Avoid huge monolithic scripts.
- Prefer modular stage files when systems grow.
- Emit should handle replicated feedback.

Important game Intents may include:

- `AttackIntent`
- `PickupItemIntent`
- `EquipItemIntent`
- `UseAbilityIntent`
- `StartDialogueIntent`
- `CompleteQuestIntent`
- `NPCInteractIntent`

---

# Output Expectations

When modifying code, always provide:

- List of changed files
- Summary of what changed
- How to test the change
- Risks or compatibility concerns
- Confirmation that every Intent includes all required ICF stages
- Confirmation that the code follows the project style rules

When auditing code, provide:

- Candidate actions that should become Intents
- Current files or functions involved
- Recommended Intent names
- Required pipeline stages
- Lowest-risk refactor first
- Areas where full ICF would be over-engineering

---

# Final Instruction

Build software in a way that is:

- Easy to read
- Easy to debug
- Easy to teach
- Easy to extend
- Safe to refactor
- Compatible with existing behavior
- Structured around clear Intent flow

The goal is not clever code.

The goal is controlled, understandable action flow.
