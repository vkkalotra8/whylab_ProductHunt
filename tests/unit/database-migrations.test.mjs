import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getMigrationFiles } from '../../src/server/db/migrator.ts';

test('database: getMigrationFiles discovers versioned migration files in correct order', () => {
  const files = getMigrationFiles();
  assert.ok(files.length >= 1);
  assert.strictEqual(files[0], '001_initial_schema.sql');
});

test('database: 001_initial_schema.sql defines all required multi-tenant entities', () => {
  const migrationPath = path.join(process.cwd(), 'src', 'server', 'db', 'migrations', '001_initial_schema.sql');
  assert.ok(fs.existsSync(migrationPath), 'Migration 001 must exist on disk');

  const sql = fs.readFileSync(migrationPath, 'utf-8');

  // Core multi-tenancy tables
  assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS organizations'), 'organizations table must be defined');
  assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS users'), 'users table must be defined');
  assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS memberships'), 'memberships table must be defined');
  assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS projects'), 'projects table must be defined');

  // ML metadata tables
  assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS models'), 'models table must be defined');
  assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS model_versions'), 'model_versions table must be defined');
  assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS datasets'), 'datasets table must be defined');
  assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS dataset_versions'), 'dataset_versions table must be defined');

  // Investigation & Evidence tables
  assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS investigations'), 'investigations table must be defined');
  assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS evidence'), 'evidence table must be defined');
  assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS hypotheses'), 'hypotheses table must be defined');
  assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS repair_candidates'), 'repair_candidates table must be defined');

  // Compliance & tracking tables
  assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS audit_events'), 'audit_events table must be defined');
  assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS _whylab_migrations'), 'migration tracker table must be defined');

  // Tenant foreign keys and index constraints
  assert.ok(sql.includes('REFERENCES organizations(id)'), 'Foreign key to organizations must be enforced');
  assert.ok(sql.includes('REFERENCES projects(id)'), 'Foreign key to projects must be enforced');
  assert.ok(sql.includes('REFERENCES investigations(id)'), 'Foreign key to investigations must be enforced');
  assert.ok(sql.includes('idx_audit_org_time'), 'Audit index by organization and time must exist');
  assert.ok(sql.includes('uq_membership_org_user'), 'Unique membership constraint must exist');
});
