-- Run once on an existing schema; fresh DDL already permits unknown times.
-- Registering an existing file today does not establish its original download time.
ALTER TABLE source_artifacts MODIFY (collected_at NULL);
