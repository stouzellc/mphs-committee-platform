-- Undo 001: removes ALL MPHS tables and data. Only for rebuilding an empty test database. Take a backup first.
DROP TABLE IF EXISTS auth_states;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS users;
DROP TRIGGER IF EXISTS audit_no_truncate ON audit;
DROP TRIGGER IF EXISTS audit_no_change ON audit;
DROP TABLE IF EXISTS audit;
DROP FUNCTION IF EXISTS audit_append_only();
DROP TRIGGER IF EXISTS records_ledger_guard ON records;
DROP TABLE IF EXISTS records;
DROP FUNCTION IF EXISTS ledger_guard();
DROP TABLE IF EXISTS meta;
