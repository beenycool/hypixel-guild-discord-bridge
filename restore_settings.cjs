const fs = require('fs');
const { exec } = require('child_process');

const backup = JSON.parse(fs.readFileSync('appsettings_backup.json', 'utf8'));
const settings = {};

backup.forEach(item => {
    // Skip slot settings if not needed, but usually we want them.
    // Skip system managed settings if any?
    if (item.name === 'WEBSITE_HTTPLOGGING_RETENTION_DAYS') return; // Optional
    settings[item.name] = item.value;
});

// Construct the arguments
const args = Object.entries(settings).map(([key, val]) => {
    // Escape quotes if necessary, but exec handles some.
    // Safest is to write to a json file and use --settings @file.json
    return `"${key}=${val}"`; // This might be tricky with complex values like CONFIG_B64
});

// Better approach: Write a new JSON file for import
const newSettings = {};
backup.forEach(item => {
    newSettings[item.name] = item.value;
});

fs.writeFileSync('appsettings_restore.json', JSON.stringify(newSettings, null, 2));
console.log('Created appsettings_restore.json');
