const app = require('./app');
const config = require('./config');
const db = require('./db');

async function main() {
  try {
    await db.ping();
  } catch (err) {
    console.error(`\nCould not connect to MySQL (${config.db.user}@${config.db.host}:${config.db.port}/${config.db.database}).`);
    console.error(`  ${err.message}`);
    console.error('\nRun database/setup.sql in MySQL Workbench, then `npm run db:setup` to create tables and import data.');
    process.exit(1);
  }

  const server = app.listen(config.port, () => {
    console.log(`Gmedic Platform Portal running at http://localhost:${config.port}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${config.port} is already in use. Start with another port, e.g. PORT=3001 npm start`);
      process.exit(1);
    }
    throw err;
  });
}

main();
