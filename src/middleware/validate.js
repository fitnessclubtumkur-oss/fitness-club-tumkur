// src/middleware/validate.js
'use strict';

const { validationResult } = require('express-validator');
const { validationError } = require('../utils/response');

/**
 * Run express-validator checks and return 422 if any fail
 */
function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return validationError(res, errors.array().map(e => ({ field: e.path, message: e.msg })));
  }
  next();
}

module.exports = validate;
