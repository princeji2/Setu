'use strict';

/**
 * MockVerificationProvider
 *
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  DEVELOPMENT MOCK — NOT GOVERNMENT VERIFICATION             ║
 * ║                                                              ║
 * ║  This provider only checks that the submitted values pass    ║
 * ║  the configured format rules.                                ║
 * ║                                                              ║
 * ║  It does NOT:                                                ║
 * ║  • Query any government database                             ║
 * ║  • Confirm that a Driving Licence is genuine                 ║
 * ║  • Confirm that a Jan Aadhaar ID exists                      ║
 * ║  • Scrape any government website                             ║
 * ║  • Bypass any CAPTCHA or authentication                      ║
 * ║                                                              ║
 * ║  A FORMAT_VALID result only means the entered value matches  ║
 * ║  the configured pattern — nothing more.                      ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

const config = require('../../config/env');

const PROVIDER_NAME = 'MockVerificationProvider (DEVELOPMENT MOCK — NOT GOVERNMENT VERIFICATION)';

class MockVerificationProvider {
  /**
   * "Verify" a driving licence by checking format only.
   */
  async verifyDrivingLicence({ licenceNumber, licenceIssueDate, licenceValidFrom, licenceExpiryDate }) {
    const pattern = new RegExp(config.validation.licenceNumberPattern);

    if (!licenceNumber || !pattern.test(licenceNumber.toUpperCase())) {
      return {
        status:   'VERIFICATION_FAILED',
        provider: PROVIDER_NAME,
        notes:    'Licence number did not match the expected format pattern.',
      };
    }

    // Basic date sanity (already validated at input; double-checked here)
    if (licenceIssueDate && licenceValidFrom && new Date(licenceIssueDate) > new Date(licenceValidFrom)) {
      return {
        status:   'VERIFICATION_FAILED',
        provider: PROVIDER_NAME,
        notes:    'Issue date is after validity-from date.',
      };
    }

    if (licenceValidFrom && licenceExpiryDate && new Date(licenceExpiryDate) < new Date(licenceValidFrom)) {
      return {
        status:   'VERIFICATION_FAILED',
        provider: PROVIDER_NAME,
        notes:    'Expiry date is before validity-from date.',
      };
    }

    return {
      status:   'FORMAT_VALID',
      provider: PROVIDER_NAME,
      notes:    'Licence number format matched configured pattern. This does NOT confirm the licence is genuine.',
    };
  }

  /**
   * "Verify" a Jan Aadhaar ID by checking format only.
   */
  async verifyJanAadhaar({ janAadhaarId, familyMembersCount }) {
    const expectedLen = config.validation.janAadhaarIdLength;
    const id          = String(janAadhaarId || '').trim();

    if (!/^\d+$/.test(id) || id.length !== expectedLen) {
      return {
        status:   'VERIFICATION_FAILED',
        provider: PROVIDER_NAME,
        notes:    `Jan Aadhaar ID must be exactly ${expectedLen} numeric digits.`,
      };
    }

    if (!Number.isInteger(familyMembersCount) || familyMembersCount < 1 || familyMembersCount > 50) {
      return {
        status:   'VERIFICATION_FAILED',
        provider: PROVIDER_NAME,
        notes:    'Family members count is out of acceptable range.',
      };
    }

    return {
      status:   'FORMAT_VALID',
      provider: PROVIDER_NAME,
      notes:    'Jan Aadhaar ID format matched configured length. This does NOT confirm the ID exists in any government database.',
    };
  }
}

module.exports = MockVerificationProvider;
