const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'vedaq.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error('Database connection error:', err.message);
});

// Safe non-destructive column additions
function addColumnIfNotExists(table, column, definition) {
  db.all(`PRAGMA table_info(${table})`, [], (err, columns) => {
    if (err) return;
    const exists = columns.some((c) => c.name === column);
    if (!exists) {
      db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`, (alterErr) => {
        if (alterErr) console.error(`Error adding ${column} to ${table}:`, alterErr.message);
      });
    }
  });
}

db.serialize(() => {
  // Ensure base tables exist without destroying existing records
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password_hash TEXT,
      role TEXT DEFAULT 'employee',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tracking_id TEXT UNIQUE,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      service_type TEXT,
      description TEXT,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Non-destructive schema extensions for the 4 service pillars
  addColumnIfNotExists('requests', 'service_pillar', "TEXT DEFAULT 'life_management'");
  addColumnIfNotExists('requests', 'channel_origin', "TEXT DEFAULT 'web'");
  addColumnIfNotExists('requests', 'scheduled_datetime', 'TEXT');
  addColumnIfNotExists('requests', 'target_provider_or_entity', 'TEXT');
  addColumnIfNotExists('requests', 'customer_approval_state', "TEXT DEFAULT 'not_required'");
  addColumnIfNotExists('requests', 'internal_notes', 'TEXT');
  addColumnIfNotExists('requests', 'customer_notes', 'TEXT');
  addColumnIfNotExists('requests', 'assigned_employee_id', 'INTEGER');
  addColumnIfNotExists('requests', 'followup_date', 'TEXT');
});

module.exports = db;