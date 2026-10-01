'use strict';

process.env.NODE_ENV = 'test';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const config = require('../src/config/env');
const { createApp } = require('../src/app');
const { createInMemoryAdminRepository } = require('../src/citizen-api/repositories/admin-repository');

const ADMIN_KEY = config.admin.key || 'test-only-admin-key';

test('Admin applications search and filter functionality', async (t) => {
  const citizens = [
    { id: 'cit-1', full_name: 'Khushi Sharma', email: 'khushi.sharma@example.com' },
    { id: 'cit-2', full_name: 'Ankit Rajput', email: 'ankitrajput52397@gmail.com' },
    { id: 'cit-3', full_name: 'Aditi Rao', email: 'aditi.rao@example.com' },
  ];

  const applications = [
    {
      id: 'app-1',
      citizen_id: 'cit-1',
      type: 'voter_id_verification',
      status: 'complete',
      created_at: new Date('2026-09-01T10:00:00Z').toISOString(),
      updated_at: new Date('2026-09-01T10:05:00Z').toISOString(),
    },
    {
      id: 'app-2',
      citizen_id: 'cit-2',
      type: 'pan_verification',
      status: 'submitted',
      created_at: new Date('2026-09-02T10:00:00Z').toISOString(),
      updated_at: new Date('2026-09-02T10:05:00Z').toISOString(),
    },
    {
      id: 'app-3',
      citizen_id: 'cit-3',
      type: 'voter_id_verification',
      status: 'complete',
      created_at: new Date('2026-09-03T10:00:00Z').toISOString(),
      updated_at: new Date('2026-09-03T10:05:00Z').toISOString(),
    },
  ];

  const calls = [
    { application_id: 'app-1', department: 'national_identity_registry', succeeded: true },
    { application_id: 'app-2', department: 'digital_tax_records', succeeded: true },
    { application_id: 'app-3', department: 'national_identity_registry', succeeded: true },
  ];

  const inMemoryAdminRepo = createInMemoryAdminRepository({
    citizens,
    applications,
    calls,
  });

  const app = createApp({ adminRepository: inMemoryAdminRepo });

  await t.test('GET /api/v1/admin/applications returns all 3 applications when unqueried', async () => {
    const res = await request(app)
      .get('/api/v1/admin/applications')
      .set('X-Admin-Key', ADMIN_KEY);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.length, 3);
  });

  await t.test('Search matches citizen name (e.g. "khushi")', async () => {
    const res = await request(app)
      .get('/api/v1/admin/applications?search=khushi')
      .set('X-Admin-Key', ADMIN_KEY);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].citizen_name, 'Khushi Sharma');
  });

  await t.test('Search matches citizen email (e.g. "ankitrajput52397@gmail.com")', async () => {
    const res = await request(app)
      .get('/api/v1/admin/applications?search=ankitrajput52397@gmail.com')
      .set('X-Admin-Key', ADMIN_KEY);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].citizen_email, 'ankitrajput52397@gmail.com');
  });

  await t.test('Search matches application type label "Voter ID"', async () => {
    const res = await request(app)
      .get('/api/v1/admin/applications?search=Voter%20ID')
      .set('X-Admin-Key', ADMIN_KEY);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 2);
    assert.ok(res.body.data.every((a) => a.type === 'voter_id_verification'));
  });

  await t.test('Combines Status + Department + Search with AND logic', async () => {
    // Complete status + National Identity Registry + typing "Aditi" narrows to app-3 only
    const res = await request(app)
      .get('/api/v1/admin/applications?status=complete&department=national_identity_registry&search=Aditi')
      .set('X-Admin-Key', ADMIN_KEY);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].citizen_name, 'Aditi Rao');
    assert.equal(res.body.data[0].id, 'app-3');

    // If search term does not match the filtered status/department, returns 0
    const nonMatchRes = await request(app)
      .get('/api/v1/admin/applications?status=complete&department=national_identity_registry&search=Ankit')
      .set('X-Admin-Key', ADMIN_KEY);

    assert.equal(nonMatchRes.status, 200);
    assert.equal(nonMatchRes.body.data.length, 0);
  });
});
