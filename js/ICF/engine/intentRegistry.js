// ICF/Engine/intentRegistry.js

/**
 * ICF Intent Registry
 *
 * The Intent Registry stores available Intent factories by Intent type.
 *
 * Important:
 * - The registry does not execute Intents.
 * - The registry does not validate business rules.
 * - The registry only helps the app find and create the correct Intent.
 *
 * Pipeline execution belongs in:
 *
 * ICF/Engine/pipeline.js
 */

var registeredIntentFactories = {};

/**
 * Registers one Intent factory.
 *
 * A factory should be a function that returns a complete Intent object.
 *
 * Example:
 *
 * registerIntent("CreateProductIntent", createProductIntent);
 *
 * @param {string} intentType - Intent type name.
 * @param {Function} intentFactory - Function that creates the Intent.
 * @returns {Object} Registration result.
 */
function registerIntent(intentType, intentFactory) {
  var validationResult = validateIntentRegistration(intentType, intentFactory);

  if (!validationResult.ok) {
    return validationResult;
  }

  if (registeredIntentFactories[intentType]) {
    return {
      ok: false,
      errors: [
        "Intent is already registered: " + intentType + "."
      ]
    };
  }

  registeredIntentFactories[intentType] = intentFactory;

  return {
    ok: true,
    intentType: intentType
  };
}

/**
 * Registers many Intent factories at once.
 *
 * Example:
 *
 * registerIntents({
 *   CreateProductIntent: createProductIntent,
 *   UpdateProductIntent: updateProductIntent
 * });
 *
 * @param {Object} intentFactories - Object of Intent factories.
 * @returns {Object} Registration result.
 */
function registerIntents(intentFactories) {
  var validationResult = validateIntentFactoriesObject(intentFactories);

  if (!validationResult.ok) {
    return validationResult;
  }

  var errors = [];
  var registeredTypes = [];
  var intentTypes = Object.keys(intentFactories);
  var intentIndex = 0;

  while (intentIndex < intentTypes.length) {
    var intentType = intentTypes[intentIndex];
    var intentFactory = intentFactories[intentType];

    var registrationResult = registerIntent(intentType, intentFactory);

    if (registrationResult.ok) {
      registeredTypes.push(intentType);
    } else {
      appendErrors(errors, registrationResult.errors);
    }

    intentIndex = intentIndex + 1;
  }

  if (errors.length > 0) {
    return {
      ok: false,
      registeredTypes: registeredTypes,
      errors: errors
    };
  }

  return {
    ok: true,
    registeredTypes: registeredTypes
  };
}

/**
 * Creates an Intent by type.
 *
 * This allows the app to request an Intent without directly importing
 * the specific Intent file everywhere.
 *
 * Example:
 *
 * var intentResult = createIntent("CreateProductIntent", actor, payload, options);
 *
 * @param {string} intentType - Intent type name.
 * @param {Object} actor - Actor requesting the action.
 * @param {Object} payload - Intent payload.
 * @param {Object} options - Optional creation options.
 * @returns {Object} Intent creation result.
 */
function createIntent(intentType, actor, payload, options) {
  var factoryResult = getIntentFactory(intentType);

  if (!factoryResult.ok) {
    return factoryResult;
  }

  try {
    var intentFactory = factoryResult.intentFactory;
    var intent = intentFactory(actor, payload, options);

    var validationResult = validateCreatedIntent(intentType, intent);

    if (!validationResult.ok) {
      return validationResult;
    }

    return {
      ok: true,
      intent: intent
    };
  } catch (error) {
    return {
      ok: false,
      errors: [
        "Failed to create Intent: " + intentType + ".",
        getErrorMessage(error)
      ]
    };
  }
}

/**
 * Gets a registered Intent factory.
 *
 * @param {string} intentType - Intent type name.
 * @returns {Object} Factory lookup result.
 */
function getIntentFactory(intentType) {
  if (!intentType) {
    return {
      ok: false,
      errors: [
        "Intent type is required."
      ]
    };
  }

  if (!registeredIntentFactories[intentType]) {
    return {
      ok: false,
      errors: [
        "Intent is not registered: " + intentType + "."
      ]
    };
  }

  return {
    ok: true,
    intentFactory: registeredIntentFactories[intentType]
  };
}

/**
 * Checks whether an Intent type is registered.
 *
 * @param {string} intentType - Intent type name.
 * @returns {boolean} True if registered.
 */
function hasIntent(intentType) {
  if (!intentType) {
    return false;
  }

  if (!registeredIntentFactories[intentType]) {
    return false;
  }

  return true;
}

/**
 * Lists all registered Intent types.
 *
 * @returns {Array} Registered Intent type names.
 */
function listIntentTypes() {
  return Object.keys(registeredIntentFactories);
}

/**
 * Clears all registered Intents.
 *
 * This is mainly useful for tests.
 *
 * Be careful using this in a real app.
 *
 * @returns {Object} Clear result.
 */
function clearRegistry() {
  registeredIntentFactories = {};

  return {
    ok: true
  };
}

/**
 * Validates a single Intent registration.
 *
 * @param {string} intentType - Intent type name.
 * @param {Function} intentFactory - Intent factory.
 * @returns {Object} Validation result.
 */
function validateIntentRegistration(intentType, intentFactory) {
  var errors = [];

  if (!intentType) {
    errors.push("Intent type is required.");
  }

  if (typeof intentType !== "string") {
    errors.push("Intent type must be a string.");
  }

  if (typeof intentFactory !== "function") {
    errors.push("Intent factory must be a function.");
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
 * Validates the object passed into registerIntents.
 *
 * @param {Object} intentFactories - Object of Intent factories.
 * @returns {Object} Validation result.
 */
function validateIntentFactoriesObject(intentFactories) {
  if (!intentFactories) {
    return {
      ok: false,
      errors: [
        "Intent factories object is required."
      ]
    };
  }

  if (typeof intentFactories !== "object") {
    return {
      ok: false,
      errors: [
        "Intent factories must be provided as an object."
      ]
    };
  }

  if (Array.isArray(intentFactories)) {
    return {
      ok: false,
      errors: [
        "Intent factories must not be an array."
      ]
    };
  }

  return {
    ok: true,
    errors: []
  };
}

/**
 * Validates that a created Intent has the expected basic shape.
 *
 * Deeper stage validation should happen inside pipeline.js.
 *
 * @param {string} expectedIntentType - Expected Intent type.
 * @param {Object} intent - Created Intent.
 * @returns {Object} Validation result.
 */
function validateCreatedIntent(expectedIntentType, intent) {
  var errors = [];

  if (!intent) {
    errors.push("Intent factory returned no Intent.");

    return {
      ok: false,
      errors: errors
    };
  }

  if (!intent.type) {
    errors.push("Created Intent is missing type.");
  }

  if (intent.type && intent.type !== expectedIntentType) {
    errors.push(
      "Created Intent type does not match requested type. Expected " +
      expectedIntentType +
      " but received " +
      intent.type +
      "."
    );
  }

  if (!intent.actor) {
    errors.push("Created Intent is missing actor.");
  }

  if (!intent.payload) {
    errors.push("Created Intent is missing payload.");
  }

  if (!intent.context) {
    errors.push("Created Intent is missing context.");
  }

  if (!intent.stages) {
    errors.push("Created Intent is missing stages.");
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
 * Adds error messages from one result into a shared error list.
 *
 * @param {Array} targetErrors - Shared errors array.
 * @param {Array} sourceErrors - Errors to append.
 */
function appendErrors(targetErrors, sourceErrors) {
  if (!sourceErrors) {
    return;
  }

  if (!Array.isArray(sourceErrors)) {
    return;
  }

  var errorIndex = 0;

  while (errorIndex < sourceErrors.length) {
    targetErrors.push(sourceErrors[errorIndex]);
    errorIndex = errorIndex + 1;
  }
}

/**
 * Converts caught errors into safe readable messages.
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
  registerIntent: registerIntent,
  registerIntents: registerIntents,
  createIntent: createIntent,
  getIntentFactory: getIntentFactory,
  hasIntent: hasIntent,
  listIntentTypes: listIntentTypes,
  clearRegistry: clearRegistry
};