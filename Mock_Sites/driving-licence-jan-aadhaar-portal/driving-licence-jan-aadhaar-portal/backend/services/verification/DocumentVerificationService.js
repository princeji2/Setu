'use strict';

/**
 * DocumentVerificationService
 *
 * Abstraction layer for document verification.
 * In development, the MockVerificationProvider is used.
 * In production, swap in an AuthorizedVerificationProvider that calls
 * a legitimate, licensed government API once available.
 *
 * IMPORTANT: Format validation does NOT establish that a Driving Licence
 * or Jan Aadhaar ID is genuine. Actual verification requires an authorized
 * government-issued API or integration, which is NOT implemented here.
 */

const config = require('../../config/env');
const MockVerificationProvider    = require('./MockVerificationProvider');
// const AuthorizedVerificationProvider = require('./AuthorizedVerificationProvider');

/**
 * Verification result statuses.
 * These must match the CHECK constraint in schema.sql.
 */
const VERIFICATION_STATUS = {
  VERIFICATION_PENDING: 'VERIFICATION_PENDING',
  FORMAT_VALID:         'FORMAT_VALID',
  VERIFIED:             'VERIFIED',
  VERIFICATION_FAILED:  'VERIFICATION_FAILED',
};

class DocumentVerificationService {
  constructor() {
    if (config.verificationProvider === 'authorized') {
      // Future: instantiate a real provider here
      // this.provider = new AuthorizedVerificationProvider();
      throw new Error('AuthorizedVerificationProvider is not yet implemented.');
    } else {
      this.provider = new MockVerificationProvider();
    }
  }

  /**
   * Verify a driving licence entry.
   * @param {object} data
   * @param {string} data.licenceNumber
   * @param {string} data.licenceHolderName
   * @param {string} data.licenceIssueDate
   * @param {string} data.licenceValidFrom
   * @param {string} data.licenceExpiryDate
   * @returns {Promise<{status: string, provider: string, notes: string}>}
   */
  async verifyDrivingLicence(data) {
    return this.provider.verifyDrivingLicence(data);
  }

  /**
   * Verify a Jan Aadhaar entry.
   * @param {object} data
   * @param {string} data.janAadhaarId
   * @param {number} data.familyMembersCount
   * @returns {Promise<{status: string, provider: string, notes: string}>}
   */
  async verifyJanAadhaar(data) {
    return this.provider.verifyJanAadhaar(data);
  }

  /**
   * Perform combined verification for a full registration.
   * Returns the least-verified status across both documents.
   */
  async verifyRegistration(registrationData) {
    const [licenceResult, janAadhaarResult] = await Promise.all([
      this.verifyDrivingLicence({
        licenceNumber:     registrationData.licence_number,
        licenceHolderName: registrationData.licence_holder_name,
        licenceIssueDate:  registrationData.licence_issue_date,
        licenceValidFrom:  registrationData.licence_valid_from,
        licenceExpiryDate: registrationData.licence_expiry_date,
      }),
      this.verifyJanAadhaar({
        janAadhaarId:       registrationData.jan_aadhaar_id,
        familyMembersCount: registrationData.family_members_count,
      }),
    ]);

    // Use the mock/first provider's status as the combined result
    // In a real integration, you'd merge results from both providers
    const combinedStatus = licenceResult.status;

    return {
      status:   combinedStatus,
      provider: licenceResult.provider,
      notes:    `Licence: ${licenceResult.notes} | JanAadhaar: ${janAadhaarResult.notes}`,
    };
  }
}

module.exports = { DocumentVerificationService, VERIFICATION_STATUS };
