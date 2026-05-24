# ICF.md

# Intent-Centric Framework

**ICF means Intent + Context + Flow.**

ICF is a software architecture pattern where meaningful actions are modeled as explicit Intents and executed through a predictable pipeline.

Important actions should not be scattered across random functions, UI handlers, services, or scripts.

They should become Intents.

---

# Core Principle

No important state mutation should happen outside an Intent execution pipeline.

This keeps the system:

- Easy to debug
- Easy to audit
- Easy to test
- Easy to extend
- Safer to refactor
- Predictable under growth

Ask this question when debugging:

> Which Intent caused this state to change?

---

# When Full ICF Is Required

Use ICF when an action changes important app, game, database, student, order, invoice, inventory, user, or system state.

Examples:

- Creating a product
- Updating inventory
- Placing an order
- Completing an invoice
- Syncing an invoice to Google Sheets
- Selecting a store
- Creating a store
- Submitting a lesson answer
- Completing a module
- Unlocking a module
- Adding a hidden marker
- Triggering a bypass timer
- Picking up an item
- Attacking an enemy
- Equipping an item
- Using an ability

---

# When Full ICF Is Not Needed

Do not over-engineer tiny visual-only actions.

Examples that may not need full ICF:

- Opening a modal
- Closing a dropdown
- Changing a local tab
- Expanding a card
- Previewing a color
- Toggling a purely visual state

However, if the action changes important state, it should usually be an Intent.

---

# Intent Requirements

Every Intent must have:

- A clear Intent name
- A clear actor
- A clear payload
- A clear context object
- All required ICF stages
- Predictable success responses
- Predictable error responses

Preferred Intent envelope shape:

```js
var intent = {
  actor: {
    id: "user_or_player_id",
    role: "student | teacher | admin | superadmin | player | system"
  },
  type: "CreateProductIntent",
  payload: {},
  context: {},
  meta: {
    createdAt: Date.now(),
    source: "ui | api | game | system"
  }
};
```

Important rule:

The payload is not automatically trusted.

Trusted information should be added during AddContext or verified before use.

---

# Required ICF Execution Model

ICF has one registration step and six execution stages.

## Registration Step

1. Intent Registration

## Execution Stages

1. Validate
2. Normalize
3. AddContext
4. Authorize
5. Process
6. Emit

The runner must call all six execution stages in order.

Do not skip stages.

Even if a stage does not need to do anything, it must still be present as an explicit pass-through stage.

Missing stages are architecture errors.

---

# Stage 1: Validate

Validate checks whether the Intent has the required fields and basic valid structure.

Validate may check:

- Required fields
- Data types
- Basic structure
- Business rule preconditions
- Valid entity state

Validate must not:

- Change the database
- Mutate important state
- Perform the main action
- Trigger UI feedback

Example:

```js
function validateCreateProductIntent(intent) {
  var errors = [];

  if (!intent.payload.name) {
    errors.push("Missing product name.");
  }

  if (typeof intent.payload.price !== "number") {
    errors.push("Price must be a number.");
  }

  if (errors.length > 0) {
    return {
      ok: false,
      stage: "Validate",
      errors: errors
    };
  }

  return {
    ok: true
  };
}
```

---

# Stage 2: Normalize

Normalize cleans, formats, converts, or standardizes payload data.

Normalize may:

- Trim strings
- Parse numbers
- Apply safe defaults
- Canonicalize timestamps
- Format values consistently

Normalize must not:

- Authorize the actor
- Change the database
- Perform the main action
- Trust client-provided context blindly

Pass-through example:

```js
function normalizeCreateProductIntent(intent) {
  return intent;
}
```

---

# Stage 3: AddContext

AddContext attaches trusted information needed to complete the action.

Examples:

- Current user role
- Verified `storeId`
- Verified `classId`
- Verified `moduleId`
- Firebase document references
- Existing product data
- Existing invoice data
- Server timestamp
- Lesson progress
- Player inventory

Do not blindly trust client-provided context.

Context should be treated as trusted only when it is loaded or verified by the system.

---

# Stage 4: Authorize

Authorize checks whether the actor is allowed to perform the action within the current context.

Authorize should happen before Process.

Authorize must not perform the main state change.

Pass-through authorization example:

```js
function authorizeCreateProductIntent(intent) {
  return {
    ok: true
  };
}
```

---

# Stage 5: Process

Process performs the main state change.

Examples:

- Write to Firestore
- Update inventory
- Complete invoice
- Unlock lesson progress
- Award XP
- Damage enemy
- Generate order

Process should not handle UI feedback directly.

Process should enforce state transition rules.

Each Intent execution should either fully succeed or fully fail.

Partial state mutation should be avoided.

---

# Stage 6: Emit

Emit returns useful results and triggers controlled side effects.

Examples:

- UI notification
- Analytics event
- Activity log
- Confetti
- Sound effect
- Order status update
- Replicated game event

Emit should return a predictable final response.

---

# Runner Rules

The Intent runner must call all six execution stages in order:

1. Validate
2. Normalize
3. AddContext
4. Authorize
5. Process
6. Emit

The runner must not silently skip missing stages.

The runner should fail clearly if an Intent is missing a required stage.

A missing stage means the Intent is not compliant with ICF.

---

# Required Blank Stage Pattern

Every Intent must include all stages, even when a stage is blank.

A blank stage should clearly return the Intent or a successful result without changing behavior.

Example blank Normalize stage:

```js
function normalizeCreateProductIntent(intent) {
  return intent;
}
```

Example blank Authorize stage:

```js
function authorizeCreateProductIntent(intent) {
  return {
    ok: true
  };
}
```

---

# Error Response Rules

Use predictable error responses.

Example:

```js
{
  ok: false,
  stage: "Validate",
  errors: [
    "Missing product name.",
    "Price must be a number."
  ]
}
```

Example:

```js
{
  ok: false,
  stage: "Authorize",
  reason: "Only admins can create products."
}
```

Do not return vague errors when a clear stage-specific error is possible.

---

# Success Response Rules

Use predictable success responses.

Example:

```js
{
  ok: true,
  message: "Product created successfully.",
  data: {
    productId: "abc123"
  }
}
```

Success responses should be simple, useful, and consistent.

---

# Logging Rules

ICF logging should make debugging easier.

Useful logs:

```js
console.info("[ICF] Pipeline started:", intent.type, "Actor:", intent.actor.id);
console.info("[ICF] Stage passed: Validate");
console.info("[ICF] Stage passed: Normalize");
console.info("[ICF] Stage passed: AddContext");
console.info("[ICF] Stage passed: Authorize");
console.info("[ICF] Stage passed: Process");
console.info("[ICF] Stage passed: Emit");
```

Do not log:

- Passwords
- Private messages
- Sensitive personal data
- Payment details
- Secret keys
- Firebase credentials

---

# State Transition Control

All entities should define valid state transitions where practical.

Illegal transitions should fail before Process.

Example:

An order may move from:

```txt
pending -> confirmed -> preparing -> delivered
```

But should not randomly move from:

```txt
delivered -> pending
```

Unless there is a specific Intent that allows that reversal.

---

# Determinism Requirement

Given the same Intent, context, and system state, the execution result should be the same.

Avoid hidden randomness, hidden mutation, and hidden side effects.

---

# Auditability Requirement

Important Intent executions should create useful audit records when practical.

Audit records may include:

- Intent ID
- Intent type
- Actor ID
- Timestamp
- Result status
- Duration
- Important emitted events

Do not include sensitive secrets in audit logs.

---

# File Organization Rules

When systems grow, do not create huge monolithic Intent files.

Preferred structure:

```txt
src/
  icf/
    engine/
      pipeline.js
      intentRegistry.js
      stageRunner.js
    stages/
      validate/
        validateCreateProduct.js
        validateUpdateInventory.js
      normalize/
        normalizeCreateProduct.js
        normalizeUpdateInventory.js
      addContext/
        addCreateProductContext.js
        addUpdateInventoryContext.js
      authorize/
        authorizeCreateProduct.js
        authorizeUpdateInventory.js
      process/
        processCreateProduct.js
        processUpdateInventory.js
      emit/
        emitCreateProductResult.js
        emitUpdateInventoryResult.js
      validators.js
      normalizers.js
      contextProviders.js
      authorizers.js
      processors.js
      emitters.js
    intents/
      createProductIntent.js
      updateInventoryIntent.js
```

Each stage helper should live in its own file.

Base registry files should import and expose named helpers.

Example:

```js
import { validateCreateProduct } from "./validate/validateCreateProduct.js";
import { validateUpdateInventory } from "./validate/validateUpdateInventory.js";

var validators = {
  validateCreateProduct: validateCreateProduct,
  validateUpdateInventory: validateUpdateInventory
};

export default validators;
```

---

# JavaScript Style Rules Inside ICF

Use:

- Traditional named functions
- Clear variable names
- Explicit helper functions
- Clear stage separation
- Simple conditionals
- Predictable return shapes

Do not use:

- Arrow functions
- Optional chaining
- Nullish coalescing
- Crypto API
- Clever shortcuts
- Dense one-line logic
- Hidden side effects

---

# Final ICF Standard

Build every meaningful action as a controlled flow:

```txt
Intent Registration
Validate
Normalize
AddContext
Authorize
Process
Emit
```

No important mutation should bypass this flow.

The goal is not clever code.

The goal is controlled, understandable action flow.
