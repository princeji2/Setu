const { pool, testConnection } = require('../backend/config/database');

const SEED_DATA = [
  {
    identityReference: 'TESTAADHAAR0003',
    fields: [
      { name: 'fullName', value: 'Test Citizen Three', verified: true, lastUpdated: '2026-09-16T17:13:09.250Z' },
      { name: 'dob', value: '1998-04-12', verified: true, lastUpdated: '2026-09-16T17:13:09.250Z' },
      { name: 'gender', value: 'Male', verified: true, lastUpdated: '2026-09-16T17:13:09.250Z' },
      { name: 'address', value: 'Synthetic Address, Test District, New Delhi - 110001', verified: true, lastUpdated: '2026-09-16T17:13:09.250Z' },
    ],
  },
  {
    identityReference: 'TESTAADHAAR0002',
    fields: [
      { name: 'fullName', value: 'Priya Sharma', verified: true, lastUpdated: '2026-09-16T17:13:09.250Z' },
      { name: 'dob', value: '1995-08-23', verified: true, lastUpdated: '2026-09-16T17:13:09.250Z' },
      { name: 'gender', value: 'Female', verified: true, lastUpdated: '2026-09-16T17:13:09.250Z' },
      { name: 'address', value: 'Plot 18, Demo Residency, Satellite, Ahmedabad, Gujarat - 380015', verified: true, lastUpdated: '2026-09-16T17:13:09.250Z' },
    ],
  },
  {
    identityReference: 'DEMO-ID-9999',
    fields: [
      { name: 'fullName', value: 'Vikram Singh', verified: true, lastUpdated: '2026-09-16T17:13:09.250Z' },
      { name: 'dob', value: '1988-11-05', verified: true, lastUpdated: '2026-09-16T17:13:09.250Z' },
      { name: 'gender', value: 'Male', verified: true, lastUpdated: '2026-09-16T17:13:09.250Z' },
      { name: 'address', value: 'House 55, Green Park Synthetic Enclave, Jaipur, Rajasthan - 302016', verified: true, lastUpdated: '2026-09-16T17:13:09.250Z' },
    ],
  },
  {
    identityReference: 'SYNTHETIC-001',
    fields: [
      { name: 'fullName', value: 'Sunita Rao', verified: true, lastUpdated: '2026-09-16T17:13:09.250Z' },
      { name: 'dob', value: '2001-01-30', verified: true, lastUpdated: '2026-09-16T17:13:09.250Z' },
      { name: 'gender', value: 'Female', verified: true, lastUpdated: '2026-09-16T17:13:09.250Z' },
      { name: 'address', value: '7th Cross, Indiranagar Demo Layout, Bengaluru, Karnataka - 560038', verified: true, lastUpdated: '2026-09-16T17:13:09.250Z' },
    ],
  },
  {
    identityReference: 'TEST-USER-ALPHA',
    fields: [
      { name: 'fullName', value: 'Ananya Verma', verified: true, lastUpdated: '2026-09-16T17:13:09.250Z' },
      { name: 'dob', value: '1992-06-19', verified: true, lastUpdated: '2026-09-16T17:13:09.250Z' },
      { name: 'gender', value: 'Female', verified: true, lastUpdated: '2026-09-16T17:13:09.250Z' },
      { name: 'address', value: 'B-12, Civic Center Layout, Test District, New Delhi - 110001', verified: true, lastUpdated: '2026-09-16T17:13:09.250Z' },
    ],
  },
];

async function seedRegistrations() {
  console.log('[REGISTRATION SEED] Checking database connectivity...');
  const conn = await testConnection();
  if (!conn.connected) {
    console.warn('[REGISTRATION SEED WARNING] Database offline, skipping persistent seed execution.');
    return;
  }

  const client = await pool.connect();
  try {
    console.log(`[REGISTRATION SEED] Seeding ${SEED_DATA.length} synthetic identity references...`);

    for (const item of SEED_DATA) {
      const query = `
        INSERT INTO registrations (identity_reference, status, fields, created_at, updated_at)
        VALUES ($1, 'REGISTERED', $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (identity_reference)
        DO UPDATE SET fields = EXCLUDED.fields, updated_at = CURRENT_TIMESTAMP;
      `;
      await client.query(query, [item.identityReference, JSON.stringify(item.fields)]);
      console.log(`  ✓ Seeded: ${item.identityReference}`);
    }

    console.log('[REGISTRATION SEED] All synthetic identifiers seeded successfully.');
  } catch (err) {
    console.error('[REGISTRATION SEED ERROR]:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  seedRegistrations()
    .then(() => pool.end())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { seedRegistrations, SEED_DATA };
