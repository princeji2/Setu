'use strict';

/**
 * Static service catalog — the "Find a service" list.
 *
 * IMPORTANT: this mirrors exactly the three application types the gateway
 * actually knows about (application-service.js KNOWN_TYPES) and the exact
 * field names each department's client returns (see the department-clients
 * translate() functions and the mock services' own field lists, confirmed
 * against their source — not guessed). The reference demo HTML in
 * refrences/ lists six services (including "income bracket check",
 * "identity re-verification", "Jan Aadhaar linking") that the gateway does
 * not implement as distinct types — those are cut here rather than faked,
 * per the "don't invent backend behavior to match a reference" rule in
 * HOW_TO_USE_REFRENCES.md.
 */

const CATALOG = [
  {
    type: 'pan_verification',
    department: 'digital_tax_records',
    departmentLabel: 'Digital Tax Records',
    name: 'PAN verification',
    description: 'Confirm your PAN against tax records — no re-upload needed.',
    fieldsRequested: ['fullName', 'filingStatus', 'incomeBracket'],
    referenceLabel: 'PAN reference',
    referencePlaceholder: 'e.g. SYNPAN-000123',
  },
  {
    type: 'identity_verification',
    department: 'national_identity_registry',
    departmentLabel: 'National Identity Registry',
    name: 'Identity verification',
    description: 'Match your identity details against the registry.',
    fieldsRequested: ['fullName', 'dob', 'gender', 'address'],
    referenceLabel: 'Identity reference',
    referencePlaceholder: 'e.g. TESTAADHAAR0001',
  },
  {
    type: 'driving_licence_registration',
    department: 'driving_licence_jan_aadhaar',
    departmentLabel: 'Driving Licence & Jan Aadhaar Portal',
    name: 'Driving licence registration',
    description: 'Verify your licence and Jan Aadhaar registration together.',
    fieldsRequested: ['licence_holder_name', 'licence_issue_date', 'licence_expiry_date'],
    referenceLabel: 'Registration reference',
    referencePlaceholder: 'e.g. REG-A3F7C291',
  },
  {
    type: 'pan_card_verification',
    department: 'digital_tax_records',
    departmentLabel: 'Digital Tax Records',
    name: 'PAN Card verification',
    description: 'Verify and link your permanent account number identity card.',
    fieldsRequested: ['fullName', 'panNumber', 'category', 'status'],
    referenceLabel: 'PAN Card reference',
    referencePlaceholder: 'e.g. PANCARD-000101',
  },
  {
    type: 'income_certificate_verification',
    department: 'digital_tax_records',
    departmentLabel: 'Digital Tax Records',
    name: 'Income Certificate verification',
    description: 'Confirm verified annual household income certificate issued by revenue authorities.',
    fieldsRequested: ['fullName', 'certificateNumber', 'annualIncome', 'validUntil'],
    referenceLabel: 'Income Certificate reference',
    referencePlaceholder: 'e.g. INC-2026-000101',
  },
  {
    type: 'voter_id_verification',
    department: 'national_identity_registry',
    departmentLabel: 'National Identity Registry',
    name: 'Voter ID (EPIC) verification',
    description: 'Verify your voter identity card and electoral constituency details.',
    fieldsRequested: ['fullName', 'epicNumber', 'constituency', 'pollingStation'],
    referenceLabel: 'Voter ID reference',
    referencePlaceholder: 'e.g. VOTER-DL-000101',
  },
  {
    type: 'birth_certificate_verification',
    department: 'national_identity_registry',
    departmentLabel: 'National Identity Registry',
    name: 'Birth Certificate verification',
    description: 'Verify civil registration birth record with registrar credentials.',
    fieldsRequested: ['fullName', 'registrationNumber', 'placeOfBirth', 'dateOfBirth'],
    referenceLabel: 'Birth Certificate reference',
    referencePlaceholder: 'e.g. BIRTH-DEL-000101',
  },
  {
    type: 'vehicle_rc_verification',
    department: 'driving_licence_jan_aadhaar',
    departmentLabel: 'Driving Licence & Jan Aadhaar Portal',
    name: 'Vehicle RC verification',
    description: 'Validate motor vehicle registration certificate and roadworthiness details.',
    fieldsRequested: ['owner_name', 'registration_number', 'vehicle_class', 'rc_status'],
    referenceLabel: 'Vehicle RC reference',
    referencePlaceholder: 'e.g. RC-7B010001',
  },
  {
    type: 'passport_verification',
    department: 'driving_licence_jan_aadhaar',
    departmentLabel: 'Driving Licence & Jan Aadhaar Portal',
    name: 'Passport verification',
    description: 'Verify passport booklet identity and validity for official services.',
    fieldsRequested: ['holder_name', 'passport_number', 'issue_date', 'expiry_date'],
    referenceLabel: 'Passport reference',
    referencePlaceholder: 'e.g. PASS-7B010001',
  },
  {
    type: 'senior_citizen_transport_concession',
    isComposite: true,
    name: 'Senior Citizen Transport Concession',
    description: 'Chained multi-department concession clearance: NIR identity verification followed by DLJA transport verification.',
    departmentLabel: 'NIR + DLJA Chained Workflow',
    departments: ['national_identity_registry', 'driving_licence_jan_aadhaar'],
    steps: [
      {
        step: 1,
        id: 'identity_verification',
        name: 'Identity Verification',
        department: 'national_identity_registry',
        departmentLabel: 'National Identity Registry',
        fieldsRequested: ['fullName', 'dob', 'gender', 'address'],
        referenceKey: 'nir_reference',
        referenceLabel: 'Identity reference (NIR)',
        referencePlaceholder: 'e.g. TESTAADHAAR0001',
      },
      {
        step: 2,
        id: 'transport_verification',
        name: 'Transport Verification',
        department: 'driving_licence_jan_aadhaar',
        departmentLabel: 'Driving Licence & Jan Aadhaar Portal',
        fieldsRequested: ['licence_holder_name', 'licence_issue_date', 'licence_expiry_date'],
        referenceKey: 'dlja_reference',
        referenceLabel: 'Registration reference (DLJA)',
        referencePlaceholder: 'e.g. REG-A3F7C291',
      },
    ],
  },
];

function findService(type) {
  return CATALOG.find((s) => s.type === type) || null;
}

function findServiceByDepartment(department) {
  return CATALOG.find((s) => s.department === department) || null;
}

export { CATALOG, findService, findServiceByDepartment };
