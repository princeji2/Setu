'use strict';

const RENDER_API_KEY = 'rnd_indisg9n44Fb9rkQjqK6bmx6NaHb';

const SERVICES = [
  { name: 'setu-nir', id: 'srv-danvl0740ujc73dc0mm0', dbName: 'nir_db' },
  { name: 'setu-dlja', id: 'srv-dao077egekts73adniig', dbName: 'dlja_db' },
];

async function updateServiceDb(srv) {
  console.log(`\n=================== Updating ${srv.name} (${srv.id}) ===================`);
  
  // 1. Fetch current env vars
  const getRes = await fetch(`https://api.render.com/v1/services/${srv.id}/env-vars`, {
    headers: { Authorization: `Bearer ${RENDER_API_KEY}` },
  });
  if (!getRes.ok) {
    throw new Error(`Failed to get env vars for ${srv.name}: ${getRes.status} ${await getRes.text()}`);
  }

  const rawVars = await getRes.json();
  const currentMap = new Map();
  for (const item of rawVars) {
    currentMap.set(item.envVar.key, item.envVar.value.trim());
  }

  console.log(`Current DB_NAME: ${currentMap.get('DB_NAME')}`);
  currentMap.set('DB_NAME', srv.dbName);
  console.log(`Setting DB_NAME -> ${srv.dbName}`);

  const payload = Array.from(currentMap.entries()).map(([key, value]) => ({ key, value }));

  // 2. PUT updated env vars
  const putRes = await fetch(`https://api.render.com/v1/services/${srv.id}/env-vars`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${RENDER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!putRes.ok) {
    throw new Error(`Failed to update env vars for ${srv.name}: ${putRes.status} ${await putRes.text()}`);
  }
  console.log(`✓ Updated environment variables for ${srv.name}.`);

  // 3. Trigger deploy
  console.log(`Triggering deploy for ${srv.name}...`);
  const depRes = await fetch(`https://api.render.com/v1/services/${srv.id}/deploys`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RENDER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ clearCache: 'do_not_clear' }),
  });

  if (!depRes.ok) {
    throw new Error(`Failed to trigger deploy for ${srv.name}: ${depRes.status} ${await depRes.text()}`);
  }
  const depData = await depRes.json();
  const deployId = depData.id || depData.deploy?.id;
  console.log(`✓ Deploy triggered for ${srv.name}. Deploy ID: ${deployId}`);
  return { service: srv, deployId };
}

async function waitForDeploy(srv, deployId) {
  console.log(`\nWaiting for ${srv.name} deploy (${deployId}) to become live...`);
  const maxWaitMs = 180000; // 3 minutes
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    await new Promise(r => setTimeout(r, 6000));
    try {
      const res = await fetch(`https://api.render.com/v1/services/${srv.id}/deploys/${deployId}`, {
        headers: { Authorization: `Bearer ${RENDER_API_KEY}` },
      });
      if (!res.ok) continue;
      const data = await res.json();
      const status = data.status || data.deploy?.status;
      process.stdout.write(`[${srv.name}] status: ${status}... `);
      if (status === 'live') {
        console.log(`\n✓ ${srv.name} is LIVE!`);
        return true;
      }
      if (status === 'build_failed' || status === 'update_failed' || status === 'canceled') {
        throw new Error(`Deploy failed for ${srv.name} with status: ${status}`);
      }
    } catch (e) {
      console.warn(`Error checking status: ${e.message}`);
    }
  }
  throw new Error(`Timeout waiting for ${srv.name} deploy to complete.`);
}

async function main() {
  const started = [];
  for (const srv of SERVICES) {
    const res = await updateServiceDb(srv);
    started.push(res);
  }

  for (const item of started) {
    await waitForDeploy(item.service, item.deployId);
  }

  console.log('\n✓ Both setu-nir and setu-dlja successfully updated and deployed with isolated databases!');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
