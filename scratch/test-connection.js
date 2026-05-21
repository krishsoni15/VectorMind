const net = require('net');
const fs = require('fs');
const path = require('path');

const logPath = path.join(__dirname, 'connection-result.txt');
function log(msg) {
  console.log(msg);
  fs.appendFileSync(logPath, msg + '\n');
}

// Clear existing log
if (fs.existsSync(logPath)) fs.unlinkSync(logPath);

log('Testing connection to db.khfddygsfwvobgwmyviy.supabase.co:5432...');
const client = net.createConnection({ host: 'db.khfddygsfwvobgwmyviy.supabase.co', port: 5432 }, () => {
  log('SUCCESS: Connected to database host successfully!');
  client.end();
  process.exit(0);
});
client.on('error', (err) => {
  log('ERROR: Connection failed: ' + err.message);
  process.exit(1);
});

setTimeout(() => {
  log('ERROR: Connection timed out.');
  process.exit(1);
}, 5000);
