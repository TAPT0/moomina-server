const fs = require('fs');
const path = require('path');

const logFile = path.join(__dirname, 'error_log.txt');
function logToFile(...args) {
    const msg = args.map(a => (a instanceof Error ? a.stack : String(a))).join(' ') + '\n';
    fs.appendFileSync(logFile, msg);
    process.stdout.write(msg);
}
console.error = logToFile;
console.log = logToFile;

async function test() {
    fs.writeFileSync(logFile, '');
    console.log('Testing LoremFlickr...');

    try {
        const url = 'https://loremflickr.com/800/600/girl,selfie,fashion';
        console.log('Fetching:', url);

        const resp = await fetch(url, { redirect: 'manual' });
        console.log('Status:', resp.status);
        if (resp.status >= 300 && resp.status < 400) {
            console.log('Redirects to:', resp.headers.get('location'));
            console.log('LoremFlickr WORKS!');
        } else if (resp.ok) {
            console.log('LoremFlickr WORKS (no redirect)!');
        } else {
            console.log('LoremFlickr failed');
        }
    } catch (e) {
        console.error('Test crashed:', e);
    }
}

test();
