// ============================================================
// Moomina AI Companion – Database Layer (Hybrid: Turso / Local)
// ============================================================
const { createClient } = require('@libsql/client');
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(__dirname, 'moomina.db');

let db = null;
let isRemote = false;

// Initialize DB (Async)
async function init() {
  if (process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) {
    // --- REMOTE MODE (Turso / LibSQL) ---
    console.log('🌍 Connecting to Remote Turso Database...');
    db = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
    isRemote = true;
  } else {
    // --- LOCAL MODE (SQL.js) ---
    console.log('💻 Using Local SQLite (sql.js)...');
    const SQL = await initSqlJs();
    if (fs.existsSync(DB_PATH)) {
      const buffer = fs.readFileSync(DB_PATH);
      db = new SQL.Database(buffer);
    } else {
      db = new SQL.Database();
    }
    isRemote = false;
  }

  // Create Tables (Compatible with both SQLite and LibSQL)
  // We use 'await execute' helper which handles both modes
  await execute(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      mood TEXT,
      has_image INTEGER DEFAULT 0,
      image_url TEXT,
      timestamp TEXT NOT NULL
    )
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS user_profile (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS moomina_state (
      id INTEGER PRIMARY KEY,
      current_mood TEXT NOT NULL DEFAULT 'Affectionate',
      energy_level INTEGER NOT NULL DEFAULT 85,
      last_interaction_time TEXT NOT NULL
    )
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      category TEXT DEFAULT 'general',
      importance INTEGER DEFAULT 5,
      created_at TEXT NOT NULL
    )
  `);

  // Seed Data
  const stateRows = await query("SELECT id FROM moomina_state WHERE id = 1");
  if (stateRows.length === 0) {
    await execute("INSERT INTO moomina_state (id, current_mood, energy_level, last_interaction_time) VALUES (1, 'Affectionate', 85, datetime('now'))");
  }

  const nameRows = await query("SELECT key FROM user_profile WHERE key = 'name'");
  if (nameRows.length === 0) {
    await execute("INSERT OR REPLACE INTO user_profile (key, value, updated_at) VALUES ('name', 'Aahil', datetime('now'))");
    await execute("INSERT OR REPLACE INTO user_profile (key, value, updated_at) VALUES ('relationship_status', 'Partner', datetime('now'))");
  }

  if (!isRemote) saveLocal();
  console.log('📦 Database initialized');
  return db;
}

// Helper: Execute a statement (INSERT/UPDATE/DELETE)
async function execute(sql, args = []) {
  if (isRemote) {
    return await db.execute({ sql, args });
  } else {
    // sql.js run is synchronous but we wrap to match async interface
    db.run(sql, args);
    saveLocal();
    return { rowsAffected: 1 }; // Mock return
  }
}

// Helper: Query results (SELECT)
async function query(sql, args = []) {
  if (isRemote) {
    const result = await db.execute({ sql, args });
    // Turso returns { columns: [], rows: [{...}, {...}] } or similar depending on client version
    // @libsql/client usually returns rows as objects if configured, or array.
    return result.rows;
  } else {
    const result = db.exec(sql, args);
    if (result.length === 0) return [];
    // Convert sql.js [values array] to object array to match Turso
    const columns = result[0].columns;
    const values = result[0].values;
    return values.map(row => {
      const obj = {};
      columns.forEach((col, i) => { obj[col] = row[i]; });
      return obj;
    });
  }
}

// Helper: Persist local DB
function saveLocal() {
  if (isRemote || !db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

function now() {
  return new Date().toISOString();
}

// ── Messages ──────────────────────────────────────────────────
async function saveMessage(role, content, mood = null, has_image = false, image_url = null) {
  const id = uuidv4();
  await execute(
    "INSERT INTO messages (id, role, content, mood, has_image, image_url, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [id, role, content, mood, has_image ? 1 : 0, image_url, now()]
  );
  return id;
}

async function deleteMessage(id) {
  await execute("DELETE FROM messages WHERE id = ?", [id]);
  return true;
}

async function getRecentMessages(limit = 20) {
  const rows = await query(`SELECT role, content, mood, timestamp FROM messages ORDER BY timestamp DESC LIMIT ${limit}`);
  return rows.reverse();
}

async function getAllMessages() {
  return await query("SELECT id, role, content, mood, has_image, image_url, timestamp FROM messages ORDER BY timestamp ASC");
}

async function getMessageCount() {
  const rows = await query("SELECT COUNT(*) as count FROM messages");
  return rows.length > 0 ? (rows[0].count || Object.values(rows[0])[0]) : 0;
}

// ── User Profile ──────────────────────────────────────────────
async function getUserProfile() {
  const rows = await query("SELECT key, value FROM user_profile");
  if (rows.length === 0) return {};
  const profile = {};
  for (const row of rows) {
    profile[row.key || row[0]] = row.value || row[1]; // Handle both obj/array just in case
  }
  return profile;
}

async function updateUserProfile(key, value) {
  await execute(
    "INSERT OR REPLACE INTO user_profile (key, value, updated_at) VALUES (?, ?, ?)",
    [key, value, now()]
  );
}

async function getPushToken() {
  const rows = await query("SELECT value FROM user_profile WHERE key = 'push_token'");
  if (rows.length === 0) return null;
  return rows[0].value;
}

async function updatePushToken(token) {
  await updateUserProfile('push_token', token);
}

// ── Moomina State ─────────────────────────────────────────────
async function getMoominaState() {
  const rows = await query("SELECT id, current_mood, energy_level, last_interaction_time FROM moomina_state WHERE id = 1");
  if (rows.length === 0) return { current_mood: 'Affectionate', energy_level: 85, last_interaction_time: now() };
  return rows[0];
}

async function updateMoominaState(mood, energyLevel) {
  await execute(
    "UPDATE moomina_state SET current_mood = ?, energy_level = ?, last_interaction_time = ? WHERE id = 1",
    [mood, energyLevel, now()]
  );
}

// ── Memories ──────────────────────────────────────────────────
async function saveMemory(content, category = 'general', importance = 5) {
  const id = uuidv4();
  await execute(
    "INSERT INTO memories (id, content, category, importance, created_at) VALUES (?, ?, ?, ?, ?)",
    [id, content, category, importance, now()]
  );
  return id;
}

async function getAllMemories() {
  return await query("SELECT id, content, category, importance, created_at FROM memories ORDER BY created_at DESC");
}

async function deleteMemory(id) {
  const result = await execute("DELETE FROM memories WHERE id = ?", [id]);
  return result;
}

async function updateMemory(id, content) {
  const result = await execute("UPDATE memories SET content = ? WHERE id = ?", [content, id]);
  return result;
}

module.exports = {
  init,
  saveMessage,
  deleteMessage,
  getRecentMessages,
  getAllMessages,
  getMessageCount,
  getUserProfile,
  updateUserProfile,
  getMoominaState,
  updateMoominaState,
  saveMemory,
  getAllMemories,
  deleteMemory,
  updateMemory,
  getPushToken,
  updatePushToken,
};
