-- Undo 002: remove invite links and sign-in attempt tracking. Members keep their passwords; open links stop working.
DROP TABLE IF EXISTS login_failures;
DROP TABLE IF EXISTS invites;
