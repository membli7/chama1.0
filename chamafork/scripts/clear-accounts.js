const fs = require('fs');
const path = require('path');

const accountsFile = path.resolve(__dirname, '..', 'uploads', 'profile-details.json');

// Overwrite with empty object to remove all accounts
fs.writeFileSync(accountsFile, JSON.stringify({}, null, 2), 'utf8');
console.log('All accounts cleared');
