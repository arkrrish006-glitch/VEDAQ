const readline = require('readline');
const bcrypt = require('bcryptjs');
const db = require('./database');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('\n=== VEDAQ Employee Account Setup ===');

rl.question('Enter Employee Name: ', (name) => {
  if (!name.trim()) {
    console.error('Name cannot be empty.');
    process.exit(1);
  }

  rl.question('Enter Corporate Email: ', (email) => {
    if (!email.trim() || !email.includes('@')) {
      console.error('Valid email is required.');
      process.exit(1);
    }

    rl.question('Enter Role (e.g., Operations Lead, Specialist): ', (role) => {
      rl.question('Enter Password (min 8 characters): ', (password) => {
        if (!password || password.length < 8) {
          console.error('Password must be at least 8 characters.');
          process.exit(1);
        }

        const hash = bcrypt.hashSync(password, 12);
        const cleanEmail = email.trim().toLowerCase();
        const cleanName = name.trim();
        const cleanRole = role.trim() || 'Specialist';

        db.run(
          `INSERT INTO employees (name, email, role, password_hash) VALUES (?, ?, ?, ?)`,
          [cleanName, cleanEmail, cleanRole, hash],
          function (err) {
            if (err) {
              console.error('Failed to create employee (Email may already exist).', err.message);
            } else {
              console.log(`\nEmployee account created successfully for ${cleanName} (${cleanEmail}). ID: ${this.lastID}`);
            }
            rl.close();
            process.exit(0);
          }
        );
      });
    });
  });
});