'use strict';

const { Pool } = require('pg');

const NEON_BASE = 'postgresql://neondb_owner:npg_PoTiKIwjZ89F@ep-still-credit-b4n31lsm-pooler.c-6.us-east-2.aws.neon.tech';
const SSL = { rejectUnauthorized: false };

async function checkNIR() {
  console.log('=== Checking NIR (Neon nir_db) ===');
  const pool = new Pool({ connectionString: `${NEON_BASE}/nir_db?sslmode=require`, ssl: SSL });
  const testRefs = [
    'TESTAADHAAR0001',
    'VOTER-DL-000101',
    'BIRTH-DEL-000101',
    'VOTER-DL-000123',
    'BIRTH-DEL-000123',
    'VOTER-DL-2001',
    'BIRTH-DEL-2001'
  ];
  for (const ref of testRefs) {
    const res = await pool.query('SELECT identity_reference FROM registrations WHERE identity_reference = $1', [ref]);
    console.log(`  ${ref}: ${res.rows.length ? 'FOUND' : 'MISSING'}`);
  }
  await pool.end();
}

async function checkDLJA() {
  console.log('\n=== Checking DLJA (Neon dlja_db) ===');
  const pool = new Pool({ connectionString: `${NEON_BASE}/dlja_db?sslmode=require`, ssl: SSL });
  const testRefs = [
    { table: 'registrations', ref: 'REG-A3F7C291' },
    { table: 'registrations', ref: 'REG-7B010001' },
    { table: 'vehicle_rcs', ref: 'RC-7B010001' },
    { table: 'vehicle_rcs', ref: 'RC-DL01AB0123' },
    { table: 'passports', ref: 'PASS-7B010001' },
    { table: 'passports', ref: 'PASS-K0000123' }
  ];
  for (const item of testRefs) {
    const res = await pool.query(`SELECT registration_reference FROM ${item.table} WHERE registration_reference = $1`, [item.ref]);
    console.log(`  ${item.table} -> ${item.ref}: ${res.rows.length ? 'FOUND' : 'MISSING'}`);
  }
  await pool.end();
}

async function main() {
  await checkNIR();
  await checkDLJA();
}

main().catch(console.error);
