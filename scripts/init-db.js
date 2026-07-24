import 'dotenv/config';
import fs from 'node:fs/promises';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL === 'disable' ? false : process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false });
try {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  const sql = await fs.readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');
  await pool.query(sql);
  console.log('Database schema initialized.');
} finally { await pool.end(); }
