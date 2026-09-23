-- Migration target only. Production continues to use Firebase until a later cutover.
CREATE DATABASE IF NOT EXISTS `t_training_migration`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE `t_training_migration`;

CREATE TABLE IF NOT EXISTS `auth_users` (
  `uid` varchar(128) NOT NULL,
  `email` varchar(320) DEFAULT NULL,
  `display_name` varchar(200) DEFAULT NULL,
  `email_verified` tinyint(1) NOT NULL DEFAULT 0,
  `disabled` tinyint(1) NOT NULL DEFAULT 0,
  `phone_number` varchar(40) DEFAULT NULL,
  `created_at_iso` varchar(64) DEFAULT NULL,
  `last_login_at_iso` varchar(64) DEFAULT NULL,
  `last_refresh_at_iso` varchar(64) DEFAULT NULL,
  `password_updated_at_iso` varchar(64) DEFAULT NULL,
  `valid_since` varchar(64) DEFAULT NULL,
  `password_hash` longtext DEFAULT NULL,
  `password_salt` longtext DEFAULT NULL,
  `hash_version` varchar(64) DEFAULT NULL,
  `local_password_hash` varchar(255) DEFAULT NULL,
  `local_password_salt` varchar(255) DEFAULT NULL,
  `local_password_scheme` varchar(32) DEFAULT NULL,
  `local_password_migrated_at` timestamp NULL DEFAULT NULL,
  `raw_json` longtext NOT NULL,
  `imported_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`uid`),
  UNIQUE KEY `uq_auth_email` (`email`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `user_profiles` (
  `uid` varchar(128) NOT NULL,
  `name` varchar(200) NOT NULL DEFAULT '',
  `email` varchar(320) NOT NULL DEFAULT '',
  `phone` varchar(40) NOT NULL DEFAULT '',
  `school` varchar(240) NOT NULL DEFAULT '',
  `is_admin` tinyint(1) NOT NULL DEFAULT 0,
  `joined_at_iso` varchar(64) NOT NULL DEFAULT '',
  `raw_json` longtext NOT NULL,
  `imported_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`uid`),
  KEY `idx_profile_email` (`email`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `firestore_documents` (
  `collection_name` varchar(128) NOT NULL,
  `document_id` varchar(255) NOT NULL,
  `document_name` varchar(768) NOT NULL,
  `fields_json` longtext NOT NULL,
  `create_time_iso` varchar(64) DEFAULT NULL,
  `update_time_iso` varchar(64) DEFAULT NULL,
  `raw_json` longtext NOT NULL,
  `imported_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`collection_name`, `document_id`),
  KEY `idx_firestore_collection` (`collection_name`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `migration_meta` (
  `meta_key` varchar(128) NOT NULL,
  `meta_value` longtext NOT NULL,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`meta_key`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `auth_sessions` (
  `session_id` char(64) NOT NULL,
  `uid` varchar(128) NOT NULL,
  `refresh_token_hash` char(64) NOT NULL,
  `expires_at` datetime(3) NOT NULL,
  `created_at` datetime(3) NOT NULL,
  `last_used_at` datetime(3) NOT NULL,
  `revoked_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`session_id`),
  UNIQUE KEY `uq_refresh_token_hash` (`refresh_token_hash`),
  KEY `idx_session_uid` (`uid`),
  KEY `idx_session_expiry` (`expires_at`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `auth_action_tokens` (
  `token_hash` char(64) NOT NULL,
  `uid` varchar(128) NOT NULL,
  `action_type` varchar(32) NOT NULL,
  `target_email` varchar(320) NOT NULL DEFAULT '',
  `expires_at` datetime(3) NOT NULL,
  `created_at` datetime(3) NOT NULL,
  `used_at` datetime(3) DEFAULT NULL,
  `metadata_json` longtext NOT NULL,
  PRIMARY KEY (`token_hash`),
  KEY `idx_action_uid_type` (`uid`, `action_type`),
  KEY `idx_action_expiry` (`expires_at`)
) ENGINE=InnoDB;
