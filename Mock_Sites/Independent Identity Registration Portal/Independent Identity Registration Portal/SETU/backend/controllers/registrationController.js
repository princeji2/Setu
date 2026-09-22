const RegistrationService = require('../services/registrationService');
const AuditService = require('../services/auditService');
const { issueCaptcha, verifyCaptcha } = require('../services/captchaService');
const { validateSyntheticIdentity, validatePersonName, validateIndianMobile, validateAddress } = require('../utils/validators');

const DEPARTMENT_NAME = process.env.DEPARTMENT_NAME || 'National Identity Registry — Demo Department';

/**
 * Issues a new captcha challenge.
 * Route: GET /api/registration/captcha
 * Returns: { success: true, data: { token: string, image: string (data URI) } }
 */
async function getCaptcha(req, res) {
  try {
    const captchaData = issueCaptcha();
    const responseData = { token: captchaData.token, image: captchaData.svgDataUri };
    if (captchaData.demoAnswer) {
      responseData.demoAnswer = captchaData.demoAnswer;
    }
    return res.status(200).json({
      success: true,
      data: responseData,
      error: null,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      data: null,
      error: 'Failed to generate captcha. Please try again.',
    });
  }
}

/**
 * Handles identity reference check and registration (v2 — includes personal info + captcha).
 * Route: POST /api/registration/check
 * Body: { identityReference, name, mobileNumber, address, fatherName, captchaToken, captchaAnswer }
 * Returns standardized shape: { success: boolean, data: { ... } | null, error: string | null }
 */
async function checkRegistration(req, res, next) {
  try {
    const identityReference = req.normalizedIdentityReference
      || req.body.identityReference.trim().toUpperCase();
    const clientIp = req.ip || req.connection.remoteAddress || '127.0.0.1';

    // 1. Verify captcha (bypassed in non-production only if request is authenticated from Setu Gateway via X-Gateway-Key)
    const gwKey = req.headers['x-gateway-key'];
    const isGatewayBypass =
      process.env.NODE_ENV !== 'production' &&
      Boolean(gwKey && gwKey === process.env.GATEWAY_API_KEY);

    if (!isGatewayBypass) {
      const { captchaToken, captchaAnswer } = req.body;
      const captchaResult = verifyCaptcha(captchaToken, captchaAnswer);
      if (!captchaResult.valid) {
        return res.status(400).json({
          success: false,
          data: null,
          error: captchaResult.error,
          message: 'Captcha verification failed',
          errors: [{ field: 'captchaAnswer', message: captchaResult.error }],
        });
      }
    }

    // 2. Collect and re-validate personal info (defence-in-depth beyond middleware)
    const nameResult = validatePersonName(req.body.name, 'Full Name');
    const mobileResult = validateIndianMobile(req.body.mobileNumber);
    const addressResult = validateAddress(req.body.address);
    const fatherResult = validatePersonName(req.body.fatherName, "Father's Name");

    const fieldErrors = [];
    if (!nameResult.isValid) fieldErrors.push({ field: 'name', message: nameResult.error });
    if (!mobileResult.isValid) fieldErrors.push({ field: 'mobileNumber', message: mobileResult.error });
    if (!addressResult.isValid) fieldErrors.push({ field: 'address', message: addressResult.error });
    if (!fatherResult.isValid) fieldErrors.push({ field: 'fatherName', message: fatherResult.error });

    if (fieldErrors.length > 0) {
      return res.status(400).json({
        success: false,
        data: null,
        error: `Validation failed: ${fieldErrors.map((e) => e.message).join('; ')}`,
        message: 'Validation failed',
        errors: fieldErrors,
      });
    }

    const personalInfo = {
      name: nameResult.normalized,
      mobileNumber: mobileResult.normalized,
      address: addressResult.normalized,
      fatherName: fatherResult.normalized,
    };

    // 3. Perform persistent PostgreSQL check and register
    const result = await RegistrationService.checkAndRegister(identityReference, personalInfo);

    if (result.isNew) {
      // Identity is newly registered
      await AuditService.logEvent('REGISTRATION_CREATED', {
        identity_reference: identityReference,
        status: 'REGISTERED',
        // Do NOT log mobile or name in audit to minimise PII exposure
      }, clientIp);

      return res.status(200).json({
        success: true,
        data: {
          identityReference: result.record.identity_reference,
          registered: false,
          status: result.record.status,
          createdAt: result.record.created_at,
          message: 'Registered Successfully',
        },
        error: null,
      });
    } else {
      // Identity was already registered
      await AuditService.logEvent('DUPLICATE_REGISTRATION_ATTEMPT', {
        identity_reference: identityReference,
        status: 'ALREADY_REGISTERED',
      }, clientIp);

      return res.status(200).json({
        success: true,
        data: {
          identityReference: result.record.identity_reference,
          registered: true,
          status: result.record.status,
          registeredAt: result.record.created_at,
          createdAt: result.record.created_at,
          message: 'Already Registered',
        },
        error: null,
      });
    }
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieves synthetic demographic fields for a registered identity reference.
 * Route: GET /api/registration/:identityReference/fields
 * Protected via gatewayAuthMiddleware (X-Gateway-Key)
 * Returns standardized shape: { success: boolean, data: { ... } | null, error: string | null }
 */
async function getRegistrationFields(req, res, next) {
  try {
    const rawRef = req.params.identityReference;
    const clientIp = req.ip || req.connection.remoteAddress || '127.0.0.1';
    const gatewayClient = req.gateway?.client || req.headers['x-gateway-client'] || 'Setu-Gateway';

    // 1. Validate identityReference parameter format
    const validation = validateSyntheticIdentity(rawRef);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        data: null,
        error: `Validation failed: ${validation.error}`,
      });
    }

    const identityReference = validation.normalized;

    // 2. Fetch fields for identity reference
    const record = await RegistrationService.getFieldsByIdentityReference(identityReference);

    if (!record) {
      return res.status(404).json({
        success: false,
        data: null,
        error: `Identity reference '${identityReference}' not found in registration database.`,
      });
    }

    // 3. Log FIELDS_ACCESSED audit event
    const requestedFields = record.fields.map((f) => f.name);
    await AuditService.logEvent(
      'FIELDS_ACCESSED',
      {
        identity_reference: identityReference,
        service_client: gatewayClient,
        fields_requested: requestedFields,
        field_count: record.fields.length,
        department: DEPARTMENT_NAME,
      },
      clientIp
    );

    // 4. Return standardized gateway response
    return res.status(200).json({
      success: true,
      data: {
        identityReference: record.identity_reference,
        fields: record.fields,
        sourceDepartment: DEPARTMENT_NAME,
      },
      error: null,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieves verified fields for a Voter ID reference.
 * Route: GET /api/voter-id/:voterReference/fields
 */
async function getVoterIdFields(req, res, next) {
  try {
    const rawRef = req.params.voterReference || req.params.identityReference || req.params.reference;
    const clientIp = req.ip || req.connection.remoteAddress || '127.0.0.1';
    const gatewayClient = req.gateway?.client || req.headers['x-gateway-client'] || 'Setu-Gateway';

    const validation = validateSyntheticIdentity(rawRef);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        data: null,
        error: `Validation failed: ${validation.error}`,
      });
    }

    const voterReference = validation.normalized;
    const record = await RegistrationService.getFieldsByIdentityReference(voterReference);

    if (!record) {
      return res.status(404).json({
        success: false,
        data: null,
        error: `Voter ID reference '${voterReference}' not found in registration database.`,
      });
    }

    await AuditService.logEvent(
      'FIELDS_ACCESSED',
      {
        identity_reference: voterReference,
        document_type: 'voter_id',
        service_client: gatewayClient,
        field_count: record.fields.length,
        department: DEPARTMENT_NAME,
      },
      clientIp
    );

    return res.status(200).json({
      success: true,
      data: {
        identityReference: record.identity_reference,
        fields: record.fields,
        sourceDepartment: DEPARTMENT_NAME,
      },
      error: null,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieves verified fields for a Birth Certificate reference.
 * Route: GET /api/birth-certificate/:birthReference/fields
 */
async function getBirthCertificateFields(req, res, next) {
  try {
    const rawRef = req.params.birthReference || req.params.identityReference || req.params.reference;
    const clientIp = req.ip || req.connection.remoteAddress || '127.0.0.1';
    const gatewayClient = req.gateway?.client || req.headers['x-gateway-client'] || 'Setu-Gateway';

    const validation = validateSyntheticIdentity(rawRef);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        data: null,
        error: `Validation failed: ${validation.error}`,
      });
    }

    const birthReference = validation.normalized;
    const record = await RegistrationService.getFieldsByIdentityReference(birthReference);

    if (!record) {
      return res.status(404).json({
        success: false,
        data: null,
        error: `Birth Certificate reference '${birthReference}' not found in registration database.`,
      });
    }

    await AuditService.logEvent(
      'FIELDS_ACCESSED',
      {
        identity_reference: birthReference,
        document_type: 'birth_certificate',
        service_client: gatewayClient,
        field_count: record.fields.length,
        department: DEPARTMENT_NAME,
      },
      clientIp
    );

    return res.status(200).json({
      success: true,
      data: {
        identityReference: record.identity_reference,
        fields: record.fields,
        sourceDepartment: DEPARTMENT_NAME,
      },
      error: null,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getCaptcha,
  checkRegistration,
  getRegistrationFields,
  getVoterIdFields,
  getBirthCertificateFields,
};

