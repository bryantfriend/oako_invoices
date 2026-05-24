// ICF/Engine/pipeline.js

/**
 * ICF Pipeline
 *
 * This pipeline runs every Intent through the required ICF stage groups.
 *
 * Required stage group order:
 * 1. Validate
 * 2. Normalize
 * 3. AddContext
 * 4. Authorize
 * 5. Process
 * 6. Emit
 *
 * Each stage group contains named step functions.
 *
 * Example:
 *
 * stages: {
 *   Validate: {
 *     requireActor: validators.requireActor,
 *     requireProductName: validators.requireProductName
 *   },
 *   Normalize: {
 *     trimProductName: normalizers.trimProductName
 *   },
 *   AddContext: {
 *     addStoreContext: contextProviders.addStoreContext
 *   },
 *   Authorize: {
 *     requireStoreAdmin: authorizers.requireStoreAdmin
 *   },
 *   Process: {
 *     createProduct: processors.createProduct
 *   },
 *   Emit: {
 *     emitProductCreated: emitters.emitProductCreated
 *   }
 * }
 *
 * Every Intent must include every required stage group.
 * Even if a stage group has nothing to do, it must include an explicit pass-through step.
 */

var REQUIRED_STAGE_NAMES = [
  "Validate",
  "Normalize",
  "AddContext",
  "Authorize",
  "Process",
  "Emit"
];

/**
 * Runs an Intent through the full ICF pipeline.
 *
 * @param {Object} intent - The Intent object.
 * @returns {Object} Pipeline result.
 */
async function run(intent) {
  var startedAt = Date.now();
  var pipelineTrace = [];

  var initialValidationResult = validateIntentShape(intent);

  if (!initialValidationResult.ok) {
    return createFailureResult(
      "Pipeline",
      initialValidationResult.errors,
      startedAt,
      pipelineTrace
    );
  }

  console.info("[ICF] Pipeline started:", intent.type, "Actor:", getActorId(intent));

  var stageValidationResult = validateIntentStageGroups(intent);

  if (!stageValidationResult.ok) {
    return createFailureResult(
      "Pipeline",
      stageValidationResult.errors,
      startedAt,
      pipelineTrace
    );
  }

  var currentIntent = intent;
  var stageIndex = 0;

  while (stageIndex < REQUIRED_STAGE_NAMES.length) {
    var stageName = REQUIRED_STAGE_NAMES[stageIndex];
    var stageGroup = currentIntent.stages[stageName];

    var stageGroupResult = await runStageGroup(
      currentIntent,
      stageName,
      stageGroup,
      pipelineTrace
    );

    if (!stageGroupResult.ok) {
      return createStageFailureResult(
        stageName,
        stageGroupResult,
        startedAt,
        pipelineTrace
      );
    }

    currentIntent = getNextIntent(currentIntent, stageGroupResult);

    console.info("[ICF] Stage group passed:", stageName);

    stageIndex = stageIndex + 1;
  }

  return createSuccessResult(currentIntent, startedAt, pipelineTrace);
}

/**
 * Runs one required ICF stage group.
 *
 * A stage group is an object containing named step functions.
 *
 * Example:
 *
 * Validate: {
 *   requireActor: validators.requireActor,
 *   requirePayload: validators.requirePayload
 * }
 *
 * @param {Object} intent - Current Intent.
 * @param {string} stageName - Current stage group name.
 * @param {Object} stageGroup - Object containing named step functions.
 * @returns {Object} Stage group result.
 */
async function runStageGroup(intent, stageName, stageGroup, pipelineTrace) {
  var currentIntent = intent;
  var stepNames = Object.keys(stageGroup);
  var stepIndex = 0;

  while (stepIndex < stepNames.length) {
    var stepName = stepNames[stepIndex];
    var stepDefinition = stageGroup[stepName];

    console.info("[ICF] Running step:", stageName + "." + stepName);

    var stepResult = await runStageStep(
      currentIntent,
      stageName,
      stepName,
      stepDefinition
    );

    appendPipelineTrace(pipelineTrace, stepResult.traceItem);

    if (!stepResult.ok) {
      return stepResult;
    }

    currentIntent = getNextIntent(currentIntent, stepResult);

    console.info("[ICF] Step passed:", stageName + "." + stepName);

    stepIndex = stepIndex + 1;
  }

  return {
    ok: true,
    intent: currentIntent
  };
}

/**
 * Runs one named step inside a stage group.
 *
 * Preferred successful step result:
 *
 * {
 *   ok: true,
 *   intent: updatedIntent
 * }
 *
 * Preferred failure step result:
 *
 * {
 *   ok: false,
 *   errors: ["Reason here."]
 * }
 *
 * @param {Object} intent - Current Intent.
 * @param {string} stageName - Stage group name.
 * @param {string} stepName - Step name.
 * @param {*} stepDefinition - Step function or stage object.
 * @returns {Object} Step result.
 */
async function runStageStep(intent, stageName, stepName, stepDefinition) {
  var startedAt = Date.now();
  var stepRunner = getStageStepRunner(stepDefinition);

  if (!stepRunner) {
    return createInvalidStepExecutionResult(stageName, stepName, startedAt);
  }

  try {
    var result = await stepRunner(intent);

    if (!result) {
      return createStepExecutionFailure(
        stageName,
        stepName,
        [
          "Step returned no result."
        ],
        startedAt
      );
    }

    if (result.ok !== true) {
      return normalizeStepFailure(stageName, stepName, result, startedAt);
    }

    result.traceItem = createTraceItem(
      stageName,
      stepName,
      true,
      startedAt,
      null
    );

    return result;
  } catch (error) {
    return createStepExecutionFailure(
      stageName,
      stepName,
      [
        getErrorMessage(error)
      ],
      startedAt
    );
  }
}

/**
 * Validates the basic Intent shape before stage execution.
 *
 * @param {Object} intent - Intent to validate.
 * @returns {Object} Validation result.
 */
function validateIntentShape(intent) {
  var errors = [];

  if (!intent) {
    errors.push("Intent is required.");

    return {
      ok: false,
      errors: errors
    };
  }

  if (!intent.type) {
    errors.push("Intent type is required.");
  }

  if (!intent.actor) {
    errors.push("Intent actor is required.");
  }

  if (!intent.payload) {
    errors.push("Intent payload is required.");
  }

  if (!intent.context) {
    errors.push("Intent context object is required.");
  }

  if (!intent.stages) {
    errors.push("Intent stages object is required.");
  }

  if (errors.length > 0) {
    return {
      ok: false,
      errors: errors
    };
  }

  return {
    ok: true,
    errors: []
  };
}

/**
 * Validates that every required ICF stage group exists.
 *
 * Missing stage groups are architecture errors.
 * Empty stage groups are also errors because every stage must be explicit.
 *
 * @param {Object} intent - Intent to validate.
 * @returns {Object} Validation result.
 */
function validateIntentStageGroups(intent) {
  var errors = [];
  var stageIndex = 0;

  while (stageIndex < REQUIRED_STAGE_NAMES.length) {
    var stageName = REQUIRED_STAGE_NAMES[stageIndex];
    var stageGroup = intent.stages[stageName];

    validateSingleStageGroup(errors, stageName, stageGroup);

    stageIndex = stageIndex + 1;
  }

  if (errors.length > 0) {
    return {
      ok: false,
      errors: errors
    };
  }

  return {
    ok: true,
    errors: []
  };
}

/**
 * Validates one stage group.
 *
 * @param {Array} errors - Shared error list.
 * @param {string} stageName - Stage group name.
 * @param {Object} stageGroup - Stage group object.
 */
function validateSingleStageGroup(errors, stageName, stageGroup) {
  if (!stageGroup) {
    errors.push("Missing required ICF stage group: " + stageName + ".");
    return;
  }

  if (typeof stageGroup !== "object") {
    errors.push("ICF stage group must be an object: " + stageName + ".");
    return;
  }

  if (Array.isArray(stageGroup)) {
    errors.push("ICF stage group must not be an array: " + stageName + ".");
    return;
  }

  var stepNames = Object.keys(stageGroup);

  if (stepNames.length < 1) {
    errors.push("ICF stage group must include at least one explicit step: " + stageName + ".");
    return;
  }

  validateStageGroupSteps(errors, stageName, stageGroup, stepNames);
}

/**
 * Validates every step inside one stage group.
 *
 * @param {Array} errors - Shared error list.
 * @param {string} stageName - Stage group name.
 * @param {Object} stageGroup - Stage group object.
 * @param {Array} stepNames - Step names.
 */
function validateStageGroupSteps(errors, stageName, stageGroup, stepNames) {
  var stepIndex = 0;

  while (stepIndex < stepNames.length) {
    var stepName = stepNames[stepIndex];
    var stepDefinition = stageGroup[stepName];

    validateStageStepDefinition(
      errors,
      stageName,
      stepName,
      stepDefinition
    );

    stepIndex = stepIndex + 1;
  }
}

/**
 * Validates one stage step definition.
 *
 * Steps may be:
 * - a simple function
 * - a stage object with id, name, description, stageType, and run()
 *
 * @param {Array} errors - Shared error list.
 * @param {string} stageName - Stage group name.
 * @param {string} stepName - Step name.
 * @param {*} stepDefinition - Step definition.
 */
function validateStageStepDefinition(errors, stageName, stepName, stepDefinition) {
  if (typeof stepDefinition === "function") {
    return;
  }

  if (!isStageObjectDefinition(stepDefinition)) {
    errors.push(
      "ICF stage step must be a function or stage object with run(): " +
      stageName +
      "." +
      stepName +
      "."
    );
    return;
  }

  if (!isValidStageObjectDefinition(stepDefinition, stageName)) {
    errors.push(
      "ICF stage step must be a function or stage object with run(): " +
      stageName +
      "." +
      stepName +
      "."
    );
  }

  validateStageObjectMetadata(errors, stageName, stepName, stepDefinition);
}

/**
 * Validates required metadata for a stage object.
 *
 * @param {Array} errors - Shared error list.
 * @param {string} stageName - Stage group name.
 * @param {string} stepName - Step name.
 * @param {Object} stepDefinition - Stage object definition.
 */
function validateStageObjectMetadata(errors, stageName, stepName, stepDefinition) {
  if (!stepDefinition.id) {
    errors.push("ICF stage object must include id: " + stageName + "." + stepName + ".");
  }

  if (!stepDefinition.name) {
    errors.push("ICF stage object must include name: " + stageName + "." + stepName + ".");
  }

  if (!stepDefinition.description) {
    errors.push(
      "ICF stage object must include description: " +
      stageName +
      "." +
      stepName +
      "."
    );
  }

  if (!stepDefinition.stageType) {
    errors.push(
      "ICF stage object must include stageType: " +
      stageName +
      "." +
      stepName +
      "."
    );
  }

  if (typeof stepDefinition.run !== "function") {
    errors.push(
      "ICF stage object must include run() function: " +
      stageName +
      "." +
      stepName +
      "."
    );
  }

  if (stepDefinition.stageType && stepDefinition.stageType !== stageName) {
    errors.push(
      "ICF stage object stageType must match stage group: " +
      stageName +
      "." +
      stepName +
      ". Expected " +
      stageName +
      " but received " +
      stepDefinition.stageType +
      "."
    );
  }
}

/**
 * Resolves the function that should run for a stage step.
 *
 * Backward compatibility:
 * - plain functions still run directly
 * - stage objects run through their run() method
 *
 * @param {*} stepDefinition - Step definition.
 * @returns {Function|null} Runnable step function or null.
 */
function getStageStepRunner(stepDefinition) {
  if (typeof stepDefinition === "function") {
    return stepDefinition;
  }

  if (isStageObjectDefinition(stepDefinition)) {
    return stepDefinition.run;
  }

  return null;
}

/**
 * Checks whether a value is a stage object candidate.
 *
 * @param {*} stepDefinition - Step definition.
 * @returns {boolean} True if object-like.
 */
function isStageObjectDefinition(stepDefinition) {
  if (!stepDefinition) {
    return false;
  }

  if (typeof stepDefinition !== "object") {
    return false;
  }

  if (Array.isArray(stepDefinition)) {
    return false;
  }

  return true;
}

/**
 * Checks whether an object meets the full stage object contract.
 *
 * @param {Object} stepDefinition - Stage object definition.
 * @param {string} stageName - Expected stage group name.
 * @returns {boolean} True when valid.
 */
function isValidStageObjectDefinition(stepDefinition, stageName) {
  if (!stepDefinition.id) {
    return false;
  }

  if (!stepDefinition.name) {
    return false;
  }

  if (!stepDefinition.description) {
    return false;
  }

  if (!stepDefinition.stageType) {
    return false;
  }

  if (stepDefinition.stageType !== stageName) {
    return false;
  }

  if (typeof stepDefinition.run !== "function") {
    return false;
  }

  return true;
}

/**
 * Gets the next Intent after a successful step.
 *
 * If no updated Intent is provided, the current Intent continues.
 *
 * @param {Object} currentIntent - Current Intent.
 * @param {Object} stepResult - Step result.
 * @returns {Object} Next Intent.
 */
function getNextIntent(currentIntent, stepResult) {
  if (stepResult.intent) {
    return stepResult.intent;
  }

  return currentIntent;
}

/**
 * Normalizes step failure into a predictable shape.
 *
 * @param {string} stageName - Stage group name.
 * @param {string} stepName - Step name.
 * @param {Object} result - Original step result.
 * @returns {Object} Normalized failure result.
 */
function normalizeStepFailure(stageName, stepName, result, startedAt) {
  var errors = [];

  if (result.errors && Array.isArray(result.errors)) {
    errors = result.errors;
  } else if (result.reason) {
    errors.push(result.reason);
  } else if (result.message) {
    errors.push(result.message);
  } else {
    errors.push("Step failed without a clear error message.");
  }

  return {
    ok: false,
    stage: stageName,
    step: stepName,
    errors: errors,
    traceItem: createTraceItem(
      stageName,
      stepName,
      false,
      startedAt,
      errors
    )
  };
}

/**
 * Creates a failure result for pipeline-level errors.
 *
 * @param {string} stageName - Stage name.
 * @param {Array} errors - Error messages.
 * @param {number} startedAt - Pipeline start timestamp.
 * @returns {Object} Failure result.
 */
function createFailureResult(stageName, errors, startedAt, pipelineTrace) {
  var finishedAt = Date.now();

  return {
    ok: false,
    stage: stageName,
    errors: errors,
    meta: {
      startedAt: startedAt,
      finishedAt: finishedAt,
      durationMs: finishedAt - startedAt,
      pipelineTrace: getSafePipelineTrace(pipelineTrace)
    }
  };
}

/**
 * Creates a failure result for a failed stage group or step.
 *
 * @param {string} stageName - Failed stage group name.
 * @param {Object} stageResult - Failed stage result.
 * @param {number} startedAt - Pipeline start timestamp.
 * @returns {Object} Failure result.
 */
function createStageFailureResult(stageName, stageResult, startedAt, pipelineTrace) {
  var finishedAt = Date.now();

  console.warn("[ICF] Stage failed:", stageName, stageResult.errors);

  return {
    ok: false,
    stage: stageResult.stage,
    step: stageResult.step,
    errors: stageResult.errors,
    meta: {
      startedAt: startedAt,
      finishedAt: finishedAt,
      durationMs: finishedAt - startedAt,
      pipelineTrace: getSafePipelineTrace(pipelineTrace)
    }
  };
}

/**
 * Creates the final successful pipeline result.
 *
 * @param {Object} intent - Final Intent after all stages.
 * @param {number} startedAt - Pipeline start timestamp.
 * @returns {Object} Success result.
 */
function createSuccessResult(intent, startedAt, pipelineTrace) {
  var finishedAt = Date.now();

  console.info("[ICF] Pipeline completed:", intent.type, "Actor:", getActorId(intent));

  return {
    ok: true,
    intent: intent,
    data: getIntentResultData(intent),
    events: getIntentEvents(intent),
    meta: {
      startedAt: startedAt,
      finishedAt: finishedAt,
      durationMs: finishedAt - startedAt,
      pipelineTrace: getSafePipelineTrace(pipelineTrace)
    }
  };
}

/**
 * Creates a failure result for an invalid step at execution time.
 *
 * @param {string} stageName - Stage group name.
 * @param {string} stepName - Step name.
 * @param {number} startedAt - Step start timestamp.
 * @returns {Object} Step failure result.
 */
function createInvalidStepExecutionResult(stageName, stepName, startedAt) {
  return createStepExecutionFailure(
    stageName,
    stepName,
    [
      "ICF stage step must be a function or stage object with run(): " +
      stageName +
      "." +
      stepName +
      "."
    ],
    startedAt
  );
}

/**
 * Creates a failed step result with trace data.
 *
 * @param {string} stageName - Stage group name.
 * @param {string} stepName - Step name.
 * @param {Array} errors - Error list.
 * @param {number} startedAt - Step start timestamp.
 * @returns {Object} Failed step result.
 */
function createStepExecutionFailure(stageName, stepName, errors, startedAt) {
  return {
    ok: false,
    stage: stageName,
    step: stepName,
    errors: errors,
    traceItem: createTraceItem(
      stageName,
      stepName,
      false,
      startedAt,
      errors
    )
  };
}

/**
 * Creates one pipeline trace item.
 *
 * @param {string} stageName - Stage group name.
 * @param {string} stepName - Step name.
 * @param {boolean} ok - Success flag.
 * @param {number} startedAt - Step start timestamp.
 * @param {Array|null} errors - Optional error list.
 * @returns {Object} Trace item.
 */
function createTraceItem(stageName, stepName, ok, startedAt, errors) {
  var finishedAt = Date.now();
  var traceItem = {
    stage: stageName,
    step: stepName,
    ok: ok,
    durationMs: finishedAt - startedAt
  };

  if (errors && errors.length > 0) {
    traceItem.errors = errors;
  }

  return traceItem;
}

/**
 * Appends one trace item when present.
 *
 * @param {Array} pipelineTrace - Shared trace array.
 * @param {Object} traceItem - Trace item.
 */
function appendPipelineTrace(pipelineTrace, traceItem) {
  if (!pipelineTrace) {
    return;
  }

  if (!Array.isArray(pipelineTrace)) {
    return;
  }

  if (!traceItem) {
    return;
  }

  pipelineTrace.push(traceItem);
}

/**
 * Returns a safe pipeline trace array for final results.
 *
 * @param {Array} pipelineTrace - Shared trace array.
 * @returns {Array} Safe trace array.
 */
function getSafePipelineTrace(pipelineTrace) {
  if (!pipelineTrace) {
    return [];
  }

  if (!Array.isArray(pipelineTrace)) {
    return [];
  }

  return pipelineTrace.slice();
}

/**
 * Gets actor ID safely without optional chaining.
 *
 * @param {Object} intent - Intent object.
 * @returns {string} Actor ID.
 */
function getActorId(intent) {
  if (!intent) {
    return "unknown";
  }

  if (!intent.actor) {
    return "unknown";
  }

  if (!intent.actor.id) {
    return "unknown";
  }

  return intent.actor.id;
}

/**
 * Gets result data from the Intent context.
 *
 * Process or Emit steps may place final result data here:
 *
 * intent.context.resultData = {};
 *
 * @param {Object} intent - Intent object.
 * @returns {Object} Result data.
 */
function getIntentResultData(intent) {
  if (!intent.context) {
    return {};
  }

  if (!intent.context.resultData) {
    return {};
  }

  return intent.context.resultData;
}

/**
 * Gets emitted events from the Intent context.
 *
 * Emit steps may place events here:
 *
 * intent.context.events = [];
 *
 * @param {Object} intent - Intent object.
 * @returns {Array} Events.
 */
function getIntentEvents(intent) {
  if (!intent.context) {
    return [];
  }

  if (!intent.context.events) {
    return [];
  }

  if (!Array.isArray(intent.context.events)) {
    return [];
  }

  return intent.context.events;
}

/**
 * Converts caught errors into safe messages.
 *
 * Do not expose secrets, credentials, payment details, or private data here.
 *
 * @param {*} error - Caught error.
 * @returns {string} Error message.
 */
function getErrorMessage(error) {
  if (!error) {
    return "Unknown error.";
  }

  if (error.message) {
    return error.message;
  }

  return "Unknown error.";
}

export default {
  run: run,
  REQUIRED_STAGE_NAMES: REQUIRED_STAGE_NAMES
};
