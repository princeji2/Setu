'use strict';

const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../.env');
const envContent = fs.readFileSync(envPath, 'utf8');

function getEnvVal(key) {
  const match = envContent.match(new RegExp(`^${key}=(.*)$`, 'm'));
  return match ? match[1].trim() : null;
}

const RENDER_API_KEY = getEnvVal('RENDER_API_KEY');
const GEMINI_API_KEY = getEnvVal('GEMINI_API_KEY');
const GEMINI_MODEL = getEnvVal('GEMINI_MODEL') || 'gemini-3.6-flash';
const SERVICE_ID = 'srv-dao0kvrtqb8s73dfbl4g'; // setu-gateway

if (!RENDER_API_KEY) {
  console.error('[Error] RENDER_API_KEY not found in gateway/.env');
  process.exit(1);
}

if (!GEMINI_API_KEY) {
  console.error('[Error] GEMINI_API_KEY not found in gateway/.env');
  process.exit(1);
}

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
  console.log('   Setting GEMINI_API_KEY and GEMINI_MODEL...');
  currentMap.set('GEMINI_API_KEY', GEMINI_API_KEY);
  currentMap.set('GEMINI_MODEL', GEMINI_MODEL);

  const payload = Array.from(currentMap.entries()).map(([key, value]) => ({ key, value }));
  console.log('2. Updating environment variables on Render...');

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

  console.log('   -> GEMINI_API_KEY and GEMINI_MODEL successfully saved to Render!');

  console.log('3. Triggering a deployment on Render to apply new environment variables...');
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
  console.log(`   -> Deployment triggered successfully! Deploy ID: ${deployData.id || deployData.deploy?.id || 'ok'}`);
  console.log('   Render is now deploying setu-gateway with GEMINI_API_KEY.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
