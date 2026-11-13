-- Disable business hours check temporarily for testing
UPDATE settings SET value = 'true' WHERE key = 'ignore_hours';
