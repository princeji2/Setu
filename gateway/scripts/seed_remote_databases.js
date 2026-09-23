'use strict';

const { Pool } = require('pg');
const seedNIR = require('../../Mock_Sites/Independent Identity Registration Portal/Independent Identity Registration Portal/SETU/database/seedRegistrations');

const NEON_BASE = 'postgresql://neondb_owner:npg_PoTiKIwjZ89F@ep-still-credit-b4n31lsm-pooler.c-6.us-east-2.aws.neon.tech';
const SSL = { rejectUnauthorized: false };

async function seedNeonNIR() {
  console.log('=== 1. Seeding Neon nir_db ===');
  const pool = new Pool({
    connectionString: `${NEON_BASE}/nir_db?sslmode=require`,
    ssl: SSL,
  });

  console.log(`Seeding ${seedNIR.SEED_DATA.length} NIR records...`);
  let count = 0;
  for (const item of seedNIR.SEED_DATA) {
    const query = `
      INSERT INTO registrations (identity_reference, status, fields, created_at, updated_at)
      VALUES ($1, 'REGISTERED', $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (identity_reference)
      DO UPDATE SET fields = EXCLUDED.fields, updated_at = CURRENT_TIMESTAMP;
    `;
    await pool.query(query, [item.identityReference, JSON.stringify(item.fields)]);
    count++;
  }
  console.log(`✓ Seeded ${count} records into Neon nir_db.`);

  // Verify critical references
  const checkRefs = ['TESTAADHAAR0001', 'VOTER-DL-000101', 'BIRTH-DEL-000101', 'VOTER-DL-000123', 'BIRTH-DEL-000123'];
  for (const ref of checkRefs) {
    const res = await pool.query('SELECT identity_reference FROM registrations WHERE identity_reference = $1', [ref]);
    console.log(`  Verify ${ref}: ${res.rows.length ? 'OK' : 'MISSING'}`);
  }
  await pool.end();
}

async function seedNeonDLJA() {
  console.log('\n=== 2. Seeding Neon dlja_db ===');
  const pool = new Pool({
    connectionString: `${NEON_BASE}/dlja_db?sslmode=require`,
    ssl: SSL,
  });

  // Ensure tables exist
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vehicle_rcs (
      id SERIAL PRIMARY KEY,
      registration_reference VARCHAR(20) NOT NULL UNIQUE,
      owner_name VARCHAR(255) NOT NULL,
      vehicle_number VARCHAR(20) NOT NULL,
      vehicle_class VARCHAR(50) NOT NULL,
      maker_model VARCHAR(100) NOT NULL,
      registration_date DATE NOT NULL,
      fuel_type VARCHAR(20) NOT NULL,
      verification_status VARCHAR(50) NOT NULL DEFAULT 'FORMAT_VALID',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS passports (
      id SERIAL PRIMARY KEY,
      registration_reference VARCHAR(20) NOT NULL UNIQUE,
      holder_name VARCHAR(255) NOT NULL,
      passport_number VARCHAR(20) NOT NULL,
      dob DATE NOT NULL,
      nationality VARCHAR(50) NOT NULL DEFAULT 'INDIAN',
      issue_date DATE NOT NULL,
      expiry_date DATE NOT NULL,
      place_of_issue VARCHAR(100) NOT NULL,
      verification_status VARCHAR(50) NOT NULL DEFAULT 'FORMAT_VALID',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Extra records for Aarav Sharma / catalog placeholder aliases
  const extraRcs = [
    {
      ref: 'RC-000101',
      name: 'Aarav Sharma',
      num: 'DL-01-AB-0101',
      cls: 'Motor Car (LMV)',
      model: 'Hyundai Creta SX',
      date: '2021-06-15',
      fuel: 'PETROL',
    },
    {
      ref: 'RC-DL01AB0123',
      name: 'Aarav Sharma',
      num: 'DL-01-AB-0123',
      cls: 'Motor Car (LMV)',
      model: 'Hyundai Creta SX',
      date: '2021-06-15',
      fuel: 'PETROL',
    },
    {
      ref: 'RC-7B010001',
      name: 'Aditi Rao',
      num: 'DL-03-CC-9481',
      cls: 'Motor Car (LMV)',
      model: 'Tata Nexon EV',
      date: '2022-04-10',
      fuel: 'ELECTRIC',
    },
  ];

  for (const rc of extraRcs) {
    await pool.query(`
      INSERT INTO vehicle_rcs
        (registration_reference, owner_name, vehicle_number, vehicle_class, maker_model, registration_date, fuel_type, verification_status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'FORMAT_VALID')
      ON CONFLICT (registration_reference) DO UPDATE
        SET owner_name = EXCLUDED.owner_name,
            vehicle_number = EXCLUDED.vehicle_number,
            vehicle_class = EXCLUDED.vehicle_class,
            maker_model = EXCLUDED.maker_model,
            registration_date = EXCLUDED.registration_date,
            fuel_type = EXCLUDED.fuel_type;
    `, [rc.ref, rc.name, rc.num, rc.cls, rc.model, rc.date, rc.fuel]);
  }

  const extraPassports = [
    {
      ref: 'PASS-000101',
      name: 'Aarav Sharma',
      num: 'K2089101',
      dob: '1988-04-12',
      place: 'Delhi',
    },
    {
      ref: 'PASS-K0000123',
      name: 'Aarav Sharma',
      num: 'K2089123',
      dob: '1988-04-12',
      place: 'Delhi',
    },
    {
      ref: 'PASS-7B010001',
      name: 'Aditi Rao',
      num: 'M4091823',
      dob: '1994-03-14',
      place: 'Delhi',
    },
  ];

  for (const p of extraPassports) {
    await pool.query(`
      INSERT INTO passports
        (registration_reference, holder_name, passport_number, dob, nationality, issue_date, expiry_date, place_of_issue, verification_status)
      VALUES ($1, $2, $3, $4, 'INDIAN', '2018-05-20', '2028-05-19', $5, 'FORMAT_VALID')
      ON CONFLICT (registration_reference) DO UPDATE
        SET holder_name = EXCLUDED.holder_name,
            passport_number = EXCLUDED.passport_number,
            dob = EXCLUDED.dob,
            place_of_issue = EXCLUDED.place_of_issue;
    `, [p.ref, p.name, p.num, p.dob, p.place]);
  }

  // Also ensure registrations has REG-000101 (alias for Aarav Sharma)
  await pool.query(`
    INSERT INTO registrations
      (registration_reference, licence_number, licence_holder_name,
       licence_issue_date, licence_valid_from, licence_expiry_date,
       jan_aadhaar_id, family_members_count, verification_status, verification_provider,
       submitted_ip)
    VALUES ('REG-000101', 'DL-01198800101', 'Aarav Sharma', '2016-05-10', '2016-05-10', '2036-05-09', '1000000101', 4, 'FORMAT_VALID', 'MockVerificationProvider', '127.0.0.1')
    ON CONFLICT (registration_reference) DO NOTHING;
  `);

  console.log('✓ Seeded DLJA records into Neon dlja_db.');

  // Verify critical references
  const checkRcs = ['RC-7B010001', 'RC-000101', 'RC-DL01AB0123'];
  for (const ref of checkRcs) {
    const res = await pool.query('SELECT registration_reference FROM vehicle_rcs WHERE registration_reference = $1', [ref]);
    console.log(`  Verify ${ref}: ${res.rows.length ? 'OK' : 'MISSING'}`);
  }
  const checkPass = ['PASS-7B010001', 'PASS-000101', 'PASS-K0000123'];
  for (const ref of checkPass) {
    const res = await pool.query('SELECT registration_reference FROM passports WHERE registration_reference = $1', [ref]);
    console.log(`  Verify ${ref}: ${res.rows.length ? 'OK' : 'MISSING'}`);
  }

  await pool.end();
}

async function main() {
  await seedNeonNIR();
  await seedNeonDLJA();
  console.log('\n✓ ALL NEON DATABASE SEEDING COMPLETED SUCCESSFULLY!\n');
}

main().catch(err => {
  console.error('Fatal error seeding databases:', err);
  process.exit(1);
});
