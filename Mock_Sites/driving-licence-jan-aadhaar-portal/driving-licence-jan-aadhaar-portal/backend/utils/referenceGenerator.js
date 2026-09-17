'use strict';

const { randomBytes } = require('crypto');

/**
 * Generates a unique registration reference of the form REG-XXXXXXXX.
 * Uses cryptographically random bytes — not sequential IDs.
 *
 * Example: REG-A3F7C291
 */
function generateRegistrationReference() {
  const hex = randomBytes(4).toString('hex').toUpperCase();
  return `REG-${hex}`;
}

module.exports = { generateRegistrationReference };
