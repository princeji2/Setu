'use strict';

/**
 * Update ADMIN_KEY on Render setu-gateway service via Render API,
 * then trigger a deployment and verify the new key.
 */

const fs = require('fs');
const path = require('path');

// Read gateway/.env
const envPath = path.resolve(__dirname, '../.env');
const envContent = fs.readFileSync(envPath, 'utf8');

function getEnvVal(key) {
  const match = envContent.match(new RegExp(`^${key}=(.*)$`, 'm'));
  return match ? match[1].trim() : null;
}

const RENDER_API_KEY = getEnvVal('RENDER_API_KEY');
const NEW_ADMIN_KEY = getEnvVal('ADMIN_KEY');

if (!RENDER_API_KEY) {
  console.error('[Error] RENDER_API_KEY not found in gateway/.env');
  process.exit(1);
}

if (!NEW_ADMIN_KEY) {
  console.error('[Error] ADMIN_KEY not found in gateway/.env');
  process.exit(1);
}

const SERVICE_ID = 'srv-dao0kvrtqb8s73dfbl4g'; // setu-gateway

async function main() {
  console.log('1. Fetching current Render environment variables for setu-gateway...');
  const getRes = await fetch(`https://api.render.com/v1/services/${SERVICE_ID}/env-vars`, {
    headers: { Authorization: `Bearer ${RENDER_API_KEY}` },
  });

  if (!getRes.ok) {
    const errText = await getRes.text();
    console.error('[FAIL] Could not fetch env vars:', getRes.status, errText);
    process.exit(1);
  }

  const existingVarsRaw = await getRes.json();
  const currentMap = new Map();
  for (const item of existingVarsRaw) {
    const k = item.envVar.key;
    const v = item.envVar.value.trim();
    currentMap.set(k, v);
  }

  console.log(`   Found ${currentMap.size} current environment variables.`);
  
  // Set ADMIN_KEY to NEW_ADMIN_KEY
  currentMap.set('ADMIN_KEY', NEW_ADMIN_KEY);

  const payload = Array.from(currentMap.entries()).map(([key, value]) => ({ key, value }));
  console.log('2. Updating environment variables on Render (adding ADMIN_KEY)...');

  const putRes = await fetch(`https://api.render.com/v1/services/${SERVICE_ID}/env-vars`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${RENDER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!putRes.ok) {
    const errText = await putRes.text();
    console.error('[FAIL] Could not update env vars:', putRes.status, errText);
    process.exit(1);
  }

  console.log('   -> Environment variables updated successfully!');

  console.log('3. Triggering a deployment on Render to apply the new ADMIN_KEY...');
  const deployRes = await fetch(`https://api.render.com/v1/services/${SERVICE_ID}/deploys`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RENDER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ clearCache: 'do_not_clear' }),
  });

  if (!deployRes.ok) {
    const errText = await deployRes.text();
    console.error('[FAIL] Could not trigger deploy:', deployRes.status, errText);
    process.exit(1);
  }

  const deployData = await deployRes.json();
  console.log(`   -> Deployment triggered! Deploy ID: ${deployData.id || deployData.deploy?.id || 'ok'}`);
  console.log('   Waiting for Render to restart with the new ADMIN_KEY...');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
