import { loadConfig } from './config';
import { lanAddresses, startServer } from './server';

const config = loadConfig();
const srv = await startServer(config);

const lan = lanAddresses();
console.log(`\n🍳 Kitchen Chaos server on port ${srv.port}`);
console.log(`   WebSocket: ws://<host>:${srv.port}/ws`);
if (config.serveStatic) console.log(`   Serving web client from ${config.staticDir}`);
for (const ip of lan) console.log(`   LAN: http://${ip}:${srv.port}`);
if (config.publicUrl) console.log(`   Public URL (QR): ${config.publicUrl}`);

const shutdown = async () => {
  console.log('Shutting down…');
  await srv.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
