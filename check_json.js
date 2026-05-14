const fs = require('fs');
const filePath = 'c:/Users/aless/OneDrive/code/inglese/unit_database.json';

try {
    const data = fs.readFileSync(filePath, 'utf8');
    const json = JSON.parse(data);
    console.log("JSON is valid. Units count:", json.units.length);
    // If it's valid, I don't need to fix it.
} catch (e) {
    console.log("JSON is invalid:", e.message);
    // If it's invalid, I'll try to find where it's broken.
}
