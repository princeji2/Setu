'use strict';

const db                          = require('../config/db');
const { generateRegistrationReference } = require('../utils/referenceGenerator');
const { maskRegistration, maskLicenceNumber, maskJanAadhaarId } = require('../utils/masking');
const { logAuditEvent, getRequestIp, AUDIT_EVENTS } = require('../utils/auditLogger');
const { DocumentVerificationService } = require('../services/verification/DocumentVerificationService');

const verificationService = new DocumentVerificationService();

// ============================================================
// POST /api/v1/registrations
// ============================================================
async function createRegistration(req, res, next) {
  const ip        = getRequestIp(req);
  const userAgent = req.headers['user-agent'] || null;

  const {
    licence_number,
    licence_holder_name,
    licence_issue_date,
    licence_valid_from,
    licence_expiry_date,
    jan_aadhaar_id,
    family_members_count,
  } = req.body;

  try {
    // ── Duplicate detection ──────────────────────────────────
    const dupCheck = await db.query(
      `SELECT registration_reference
         FROM registrations
        WHERE licence_number = $1
           OR jan_aadhaar_id = $2
        LIMIT 1`,
      [licence_number.toUpperCase(), jan_aadhaar_id]
    );

    if (dupCheck.rowCount > 0) {
      await logAuditEvent({
        eventType:        AUDIT_EVENTS.REGISTRATION_DUPLICATE,
        maskedIdentifier: maskLicenceNumber(licence_number),
        ipAddress:        ip,
        userAgent,
        details: { reason: 'Duplicate licence_number or jan_aadhaar_id' },
      });

      return res.status(409).json({
        success: false,
        error:   'This document information is already registered.',
      });
    }

    // ── Verification ─────────────────────────────────────────
    const verificationResult = await verificationService.verifyRegistration({
      licence_number:     licence_number.toUpperCase(),
      licence_holder_name,
      licence_issue_date,
      licence_valid_from,
      licence_expiry_date,
      jan_aadhaar_id,
      family_members_count: parseInt(family_members_count, 10),
    });

    await logAuditEvent({
      eventType:        AUDIT_EVENTS.VERIFICATION_RESULT,
      maskedIdentifier: maskLicenceNumber(licence_number),
      ipAddress:        ip,
      userAgent,
      details: { status: verificationResult.status, provider: verificationResult.provider },
    });

    // ── Insert ───────────────────────────────────────────────
    const reference = generateRegistrationReference();

    const insertResult = await db.query(
      `INSERT INTO registrations
         (registration_reference,
          licence_number, licence_holder_name,
          licence_issue_date, licence_valid_from, licence_expiry_date,
          jan_aadhaar_id, family_members_count,
          verification_status, verification_provider, verification_notes,
          submitted_ip)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING id, registration_reference, verification_status, created_at`,
      [
        reference,
        licence_number.toUpperCase(),
        licence_holder_name.trim(),
        licence_issue_date,
        licence_valid_from,
        licence_expiry_date,
        jan_aadhaar_id,
        parseInt(family_members_count, 10),
        verificationResult.status,
        verificationResult.provider,
        verificationResult.notes,
        ip,
      ]
    );

    const created = insertResult.rows[0];

    await logAuditEvent({
      eventType:        AUDIT_EVENTS.REGISTRATION_CREATED,
      registrationRef:  created.registration_reference,
      maskedIdentifier: maskLicenceNumber(licence_number),
      ipAddress:        ip,
      userAgent,
      details: { verification_status: created.verification_status },
    });

    // ── Response — no sensitive raw values returned ──────────
    return res.status(201).json({
      success: true,
      message: 'Registration submitted successfully.',
      data: {
        registration_reference: created.registration_reference,
        verification_status:    created.verification_status,
        created_at:             created.created_at,
      },
    });

  } catch (err) {
    // PostgreSQL unique-violation caught by errorHandler (code 23505)
    return next(err);
  }
}

// ============================================================
// GET /api/v1/registrations/:reference
// ============================================================
async function getRegistration(req, res, next) {
  const { reference } = req.params;
  const ip        = getRequestIp(req);
  const userAgent = req.headers['user-agent'] || null;

  try {
    const result = await db.query(
      `SELECT * FROM registrations WHERE registration_reference = $1`,
      [reference.toUpperCase()]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, data: null, error: 'Registration not found.' });
    }

    const reg = result.rows[0];

    await logAuditEvent({
      eventType:       AUDIT_EVENTS.REGISTRATION_FETCHED,
      registrationRef: reg.registration_reference,
      ipAddress:       ip,
      userAgent,
      details:         req.gateway ? { gateway_client: req.gateway.client } : undefined,
    });

    // Return masked data — public endpoint must never expose raw identifiers
    return res.status(200).json({
      success: true,
      data:    maskRegistration(reg),
      error:   null,
    });

  } catch (err) {
    return next(err);
  }
}

module.exports = { createRegistration, getRegistration };
