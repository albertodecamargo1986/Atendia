import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "atendia.db");

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");
    _db.pragma("foreign_keys = ON");
  }
  return _db;
}

export interface QueryResult {
  rows: any[];
  rowCount: number;
}

export async function initDatabase() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      totp_secret TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      cpf_cnpj TEXT NOT NULL,
      phone TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS licenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER REFERENCES customers(id),
      serial TEXT NOT NULL UNIQUE,
      plan TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      hwid TEXT,
      activation_count INTEGER DEFAULT 0,
      transfer_count INTEGER DEFAULT 0,
      activated_at TEXT,
      expires_at TEXT NOT NULL,
      last_validation TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS license_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      license_id INTEGER REFERENCES licenses(id),
      event_type TEXT NOT NULL,
      ip_address TEXT,
      hwid TEXT,
      user_agent TEXT,
      payload TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS security_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      license_id INTEGER REFERENCES licenses(id),
      alert_type TEXT NOT NULL,
      severity TEXT NOT NULL CHECK(severity IN ('low','medium','high','critical')),
      description TEXT NOT NULL,
      raw_data TEXT DEFAULT '{}',
      ip_address TEXT,
      resolved INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER REFERENCES customers(id),
      license_id INTEGER REFERENCES licenses(id),
      gateway TEXT NOT NULL,
      gateway_transaction_id TEXT,
      amount REAL NOT NULL,
      status TEXT DEFAULT 'pending',
      paid_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS software_releases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version TEXT NOT NULL UNIQUE,
      changelog TEXT,
      file_path TEXT NOT NULL,
      file_hash TEXT NOT NULL,
      signature TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_licenses_serial ON licenses(serial);
    CREATE INDEX IF NOT EXISTS idx_licenses_customer ON licenses(customer_id);
    CREATE INDEX IF NOT EXISTS idx_licenses_status ON licenses(status);
    CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
    CREATE INDEX IF NOT EXISTS idx_security_alerts_severity ON security_alerts(severity);
    CREATE INDEX IF NOT EXISTS idx_license_events_license ON license_events(license_id);
  `);

  // Seed default admin if not exists
  const adminExists = db.prepare("SELECT id FROM admin_users WHERE email = ?").get("admin@atend-ia.com");
  if (!adminExists) {
    const bcrypt = require("bcryptjs");
    const { authenticator } = require("otplib");
    const hash = bcrypt.hashSync("At3nd1A@2024", 12);
    const secret = authenticator.generateSecret();
    db.prepare("INSERT INTO admin_users (email, password_hash, totp_secret) VALUES (?, ?, ?)").run(
      "admin@atend-ia.com", hash, secret
    );
    console.log("Default admin created — change the default password immediately");
    console.log("2FA has been configured. Use the authenticator app to scan the QR code on first login.");
  }
}

export async function query(text: string, params?: any[]): Promise<QueryResult> {
  const db = getDb();

  const trimmed = text.trim().toUpperCase();

  if (trimmed.startsWith("SELECT")) {
    const stmt = db.prepare(text);
    const rows = params ? stmt.all(...params) : stmt.all();
    return { rows, rowCount: rows.length };
  }

  if (trimmed.startsWith("INSERT")) {
    const stmt = db.prepare(text);
    const info = params ? stmt.run(...params) : stmt.run();
    return { rows: [{ id: info.lastInsertRowid }], rowCount: info.changes };
  }

  const stmt = db.prepare(text);
  const info = params ? stmt.run(...params) : stmt.run();
  return { rows: [], rowCount: info.changes };
}

export async function getClient() {
  return getDb();
}

export default getDb;
