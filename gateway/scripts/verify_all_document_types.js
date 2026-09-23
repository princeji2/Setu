'use strict';

/**
 * verify_all_document_types.js
 *
 * Hits the live deployed services to verify EVERY document type supported:
 *
 * Digital Tax Records:
 *   1. pan_verification (SYNPAN-000123)
 *   2. pan_card_verification (PANCARD-000101, PANCARD-000123)
 *   3. income_certificate_verification (INC-2026-000101, INC-2026-000123)
 *
 * National Identity Registry:
 *   4. identity_verification (TESTAADHAAR0001)
 *   5. voter_id_verification (VOTER-DL-000101, VOTER-DL-000123)
 *   6. birth_certificate_verification (BIRTH-DEL-000101, BIRTH-DEL-000123)
 *
 * Driving Licence & Jan Aadhaar:
 *   7. driving_licence_registration (REG-A3F7C291, REG-000101)
 *   8. vehicle_rc_verification (RC-000101, RC-7B010001)
 *   9. passport_verification (PASS-000101, PASS-7B010001)
 *
 * Composite:
 *   10. Senior Citizen Transport Concession (NIR Step 1 + DLJA Step 2)
 */

const DTR_BASE = 'https://setu-dtr.onrender.com';
const DTR_KEY  = 'a random secret password you make up. Save it in your notes as "DTR key"';

const NIR_BASE = 'https://setu-nir.onrender.com';
const NIR_KEY  = 'parv.1234';

const DLJA_BASE = 'https://setu-dlja.onrender.com';
const DLJA_KEY  = 'hello.key';

async function verifyDoc(department, label, url, headers) {
  try {
    const res = await fetch(url, { headers });
    const json = await res.json().catch(() => null);
    if (res.status === 200 && json && (json.success === true || json.registration_reference || json.data)) {
      console.log(`[PASS] ${department.padEnd(6)} | ${label.padEnd(35)} -> HTTP 200 (Verified)`);
      return true;
    } else {
      console.error(`[FAIL] ${department.padEnd(6)} | ${label.padEnd(35)} -> HTTP ${res.status}:`, json ? json.error : 'No JSON');
      return false;
    }
  } catch (err) {
    console.error(`[ERR ] ${department.padEnd(6)} | ${label.padEnd(35)} -> Network error:`, err.message);
    return false;
  }
}

async function main() {
  console.log('\n=============================================================');
  console.log('Verifying ALL 9 Document Types + Composite Across All Departments');
  console.log('=============================================================\n');

  let passed = 0;
  let total = 0;

  // 1. DTR
  total++;
  if (await verifyDoc('DTR', 'PAN (SYNPAN-000123)', `${DTR_BASE}/pan/SYNPAN-000123/fields`, { 'X-Gateway-Key': DTR_KEY })) passed++;

  total++;
  if (await verifyDoc('DTR', 'PAN Card (PANCARD-000101)', `${DTR_BASE}/pan-card/PANCARD-000101/fields`, { 'X-Gateway-Key': DTR_KEY })) passed++;

  total++;
  if (await verifyDoc('DTR', 'Income Cert (INC-2026-000101)', `${DTR_BASE}/income-certificate/INC-2026-000101/fields`, { 'X-Gateway-Key': DTR_KEY })) passed++;

  // 2. NIR
  total++;
  if (await verifyDoc('NIR', 'Identity (TESTAADHAAR0001)', `${NIR_BASE}/api/registration/TESTAADHAAR0001/fields`, { 'X-Gateway-Key': NIR_KEY })) passed++;

  total++;
  if (await verifyDoc('NIR', 'Voter ID (VOTER-DL-000101)', `${NIR_BASE}/api/voter-id/VOTER-DL-000101/fields`, { 'X-Gateway-Key': NIR_KEY })) passed++;

  total++;
  if (await verifyDoc('NIR', 'Birth Cert (BIRTH-DEL-000101)', `${NIR_BASE}/api/birth-certificate/BIRTH-DEL-000101/fields`, { 'X-Gateway-Key': NIR_KEY })) passed++;

  // 3. DLJA
  total++;
  if (await verifyDoc('DLJA', 'Driving Licence (REG-A3F7C291)', `${DLJA_BASE}/api/v1/gateway/registrations/REG-A3F7C291`, { 'X-Gateway-Key': DLJA_KEY })) passed++;

  total++;
  if (await verifyDoc('DLJA', 'Vehicle RC (RC-7B010001)', `${DLJA_BASE}/api/v1/gateway/vehicle-rc/RC-7B010001`, { 'X-Gateway-Key': DLJA_KEY })) passed++;

  total++;
  if (await verifyDoc('DLJA', 'Vehicle RC (RC-000101)', `${DLJA_BASE}/api/v1/gateway/vehicle-rc/RC-000101`, { 'X-Gateway-Key': DLJA_KEY })) passed++;

  total++;
  if (await verifyDoc('DLJA', 'Passport (PASS-7B010001)', `${DLJA_BASE}/api/v1/gateway/passport/PASS-7B010001`, { 'X-Gateway-Key': DLJA_KEY })) passed++;

  total++;
  if (await verifyDoc('DLJA', 'Passport (PASS-000101)', `${DLJA_BASE}/api/v1/gateway/passport/PASS-000101`, { 'X-Gateway-Key': DLJA_KEY })) passed++;

  // 4. Composite Workflow: Step 1 (NIR) + Step 2 (DLJA)
  total++;
  console.log('\n--- Composite Workflow: Senior Citizen Transport Concession ---');
  const nirStep = await verifyDoc('NIR', 'Step 1: NIR Identity', `${NIR_BASE}/api/registration/TESTAADHAAR0001/fields`, { 'X-Gateway-Key': NIR_KEY });
  const dljaStep = await verifyDoc('DLJA', 'Step 2: DLJA Transport', `${DLJA_BASE}/api/v1/gateway/registrations/REG-A3F7C291`, { 'X-Gateway-Key': DLJA_KEY });
  if (nirStep && dljaStep) {
    console.log('[PASS] Composite | Senior Citizen Transport Concession -> BOTH STEPS VERIFIED!');
    passed++;
  } else {
    console.error('[FAIL] Composite | Senior Citizen Transport Concession -> FAILED!');
  }

  console.log(`\n=============================================================`);
  console.log(`Summary: ${passed} / ${total} tests passed.`);
  console.log(`=============================================================\n`);

  if (passed !== total) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
