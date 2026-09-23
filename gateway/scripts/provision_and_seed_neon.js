'use strict';

const fs = require('fs');
const path = require('path');
const { Client, Pool } = require('pg');

const BASE_CONN = 'postgresql://neondb_owner:npg_PoTiKIwjZ89F@ep-still-credit-b4n31lsm-pooler.c-6.us-east-2.aws.neon.tech';
const SSL_CONFIG = { rejectUnauthorized: false };

async function createDatabases() {
  console.log('\n======================================================');
  console.log('1. Connecting to Neon PostgreSQL cluster...');
  console.log('======================================================');
  const client = new Client({
    connectionString: `${BASE_CONN}/neondb?sslmode=require`,
    ssl: SSL_CONFIG,
  });

  await client.connect();

  const dbsRes = await client.query('SELECT datname FROM pg_database WHERE datistemplate = false;');
  const existingDbs = dbsRes.rows.map(r => r.datname);
  console.log('Current databases in cluster:', existingDbs);

  if (!existingDbs.includes('nir_db')) {
    console.log('Creating database "nir_db"...');
    await client.query('CREATE DATABASE nir_db;');
    console.log('✓ Created nir_db');
  } else {
    console.log('• nir_db already exists');
  }

  if (!existingDbs.includes('dlja_db')) {
    console.log('Creating database "dlja_db"...');
    await client.query('CREATE DATABASE dlja_db;');
    console.log('✓ Created dlja_db');
  } else {
    console.log('• dlja_db already exists');
  }

  await client.end();
}

async function migrateAndSeedNir() {
  console.log('\n======================================================');
  console.log('2. Migrating and Seeding NIR in nir_db...');
  console.log('======================================================');
  const nirPool = new Pool({
    connectionString: `${BASE_CONN}/nir_db?sslmode=require`,
    ssl: SSL_CONFIG,
  });

  // 1. Schema
  const schemaPath = path.resolve(__dirname, '../../Mock_Sites/Independent Identity Registration Portal/Independent Identity Registration Portal/SETU/database/schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  console.log('Applying NIR schema.sql...');
  await nirPool.query(schemaSql);
  console.log('✓ NIR schema applied successfully.');

  // 2. Seeding
  const seedScript = require('../../Mock_Sites/Independent Identity Registration Portal/Independent Identity Registration Portal/SETU/database/seedRegistrations');
  console.log(`Seeding ${seedScript.SEED_DATA.length} NIR records...`);

  for (const item of seedScript.SEED_DATA) {
    const q = `
      INSERT INTO registrations (identity_reference, status, fields, created_at, updated_at)
      VALUES ($1, 'REGISTERED', $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (identity_reference)
      DO UPDATE SET fields = EXCLUDED.fields, updated_at = CURRENT_TIMESTAMP;
    `;
    await nirPool.query(q, [item.identityReference, JSON.stringify(item.fields)]);
  }
  console.log(`✓ Seeded ${seedScript.SEED_DATA.length} NIR records into nir_db.`);

  // 3. Verify
  const countRes = await nirPool.query('SELECT COUNT(*) FROM registrations;');
  console.log(`✓ Total registrations in nir_db: ${countRes.rows[0].count}`);

  const sample = await nirPool.query("SELECT identity_reference, status, fields->0->>'value' as full_name FROM registrations WHERE identity_reference = 'TESTAADHAAR0001';");
  console.log('Aarav Sharma NIR record in nir_db:', sample.rows[0]);

  await nirPool.end();
}

async function migrateAndSeedDlja() {
  console.log('\n======================================================');
  console.log('3. Migrating and Seeding DLJA in dlja_db...');
  console.log('======================================================');
  const dljaPool = new Pool({
    connectionString: `${BASE_CONN}/dlja_db?sslmode=require`,
    ssl: SSL_CONFIG,
  });

  // 1. Schema
  const schemaPath = path.resolve(__dirname, '../../Mock_Sites/driving-licence-jan-aadhaar-portal/driving-licence-jan-aadhaar-portal/database/schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  console.log('Applying DLJA schema.sql...');
  await dljaPool.query(schemaSql);
  console.log('✓ DLJA schema applied successfully.');

  // 1b. Additional tables (vehicle_rcs and passports)
  console.log('Creating vehicle_rcs and passports tables...');
  await dljaPool.query(`
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
  console.log('✓ vehicle_rcs and passports tables created successfully.');

  // 2. Seeding
  const seedScript = require('../../Mock_Sites/driving-licence-jan-aadhaar-portal/driving-licence-jan-aadhaar-portal/database/seed_documents');
  console.log(`Seeding ${seedScript.CITIZEN_DATA.length} DLJA citizen document sets...`);

  for (const c of seedScript.CITIZEN_DATA) {
    if (c.regRef) {
      await dljaPool.query(`
        INSERT INTO registrations
          (registration_reference, licence_number, licence_holder_name,
           licence_issue_date, licence_valid_from, licence_expiry_date,
           jan_aadhaar_id, family_members_count, verification_status, verification_provider,
           submitted_ip)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'FORMAT_VALID', 'MockVerificationProvider', '127.0.0.1')
        ON CONFLICT (registration_reference) DO UPDATE
          SET licence_holder_name = EXCLUDED.licence_holder_name,
              licence_issue_date  = EXCLUDED.licence_issue_date,
              licence_valid_from  = EXCLUDED.licence_valid_from,
              licence_expiry_date = EXCLUDED.licence_expiry_date;
      `, [
        c.regRef,
        c.licenceNumber,
        c.holderName,
        c.licenceIssueDate,
        c.licenceValidFrom,
        c.licenceExpiryDate,
        c.janAadhaarId,
        c.familyCount,
      ]);
    }

    if (c.rcRef) {
      await dljaPool.query(`
        INSERT INTO vehicle_rcs
          (registration_reference, owner_name, vehicle_number, vehicle_class,
           maker_model, registration_date, fuel_type, verification_status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'FORMAT_VALID')
        ON CONFLICT (registration_reference) DO UPDATE
          SET owner_name       = EXCLUDED.owner_name,
              vehicle_number   = EXCLUDED.vehicle_number,
              vehicle_class    = EXCLUDED.vehicle_class,
              maker_model      = EXCLUDED.maker_model,
              registration_date= EXCLUDED.registration_date,
              fuel_type        = EXCLUDED.fuel_type;
      `, [
        c.rcRef,
        c.holderName,
        c.vehicleNumber,
        c.vehicleClass,
        c.makerModel,
        c.regDate,
        c.fuelType,
      ]);
    }

    if (c.passRef) {
      await dljaPool.query(`
        INSERT INTO passports
          (registration_reference, holder_name, passport_number, dob,
           nationality, issue_date, expiry_date, place_of_issue, verification_status)
        VALUES ($1, $2, $3, $4, 'INDIAN', '2018-05-20', '2028-05-19', $5, 'FORMAT_VALID')
        ON CONFLICT (registration_reference) DO UPDATE
          SET holder_name   = EXCLUDED.holder_name,
              passport_number=EXCLUDED.passport_number,
              dob           = EXCLUDED.dob,
              place_of_issue= EXCLUDED.place_of_issue;
      `, [
        c.passRef,
        c.holderName,
        c.passportNumber,
        c.dob,
        c.placeOfIssue,
      ]);
    }
  }

  // 3. Verify
  const regCount = await dljaPool.query('SELECT COUNT(*) FROM registrations;');
  const rcCount = await dljaPool.query('SELECT COUNT(*) FROM vehicle_rcs;');
  const passCount = await dljaPool.query('SELECT COUNT(*) FROM passports;');
  console.log(`✓ Total in dlja_db: ${regCount.rows[0].count} registrations, ${rcCount.rows[0].count} vehicle_rcs, ${passCount.rows[0].count} passports.`);

  const sample = await dljaPool.query("SELECT registration_reference, licence_holder_name, licence_number, verification_status FROM registrations WHERE registration_reference = 'REG-A3F7C291';");
  console.log('Aarav Sharma DLJA record in dlja_db:', sample.rows[0]);

  await dljaPool.end();
}

async function main() {
  await createDatabases();
  await migrateAndSeedNir();
  await migrateAndSeedDlja();
  console.log('\n✓ ALL NEON PROVISIONING, MIGRATIONS & SEEDING COMPLETED SUCCESSFULLY!\n');
}

main().catch(err => {
  console.error('Fatal error during Neon provisioning:', err);
  process.exit(1);
});
