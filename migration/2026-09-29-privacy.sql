-- Only apply locally during phase two. Back up before the separately authorized deployment.
-- NULL means no recorded consent; never backfill agreement for existing users.
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS privacy_json JSON DEFAULT NULL;
