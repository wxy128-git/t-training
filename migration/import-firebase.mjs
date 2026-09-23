import fs from 'node:fs/promises';
import path from 'node:path';
import mysql from 'mysql2/promise';

const backupDir = process.argv[2];
if (!backupDir) throw new Error('用法：node migration/import-firebase.mjs <backup-dir>');

const db = await mysql.createConnection({
    host: process.env.T_TRAINING_DB_HOST || '127.0.0.1',
    port: Number(process.env.T_TRAINING_DB_PORT || 3306),
    user: process.env.T_TRAINING_DB_USER || 't_training_migration',
    password: process.env.T_TRAINING_DB_PASSWORD,
    database: process.env.T_TRAINING_DB_NAME || 't_training_migration',
    charset: 'utf8mb4'
});

const readJson = file => fs.readFile(file, 'utf8').then(JSON.parse);
const optional = value => value === undefined || value === null ? null : String(value);
const bool = value => value === true ? 1 : 0;
const authFile = await readJson(path.join(backupDir, 'firebase-auth-users.json'));
const manifest = await readJson(path.join(backupDir, 'manifest.json'));

await db.beginTransaction();
try {
    for (const user of authFile.users || []) {
        await db.execute(`
            INSERT INTO auth_users
              (uid, email, display_name, email_verified, disabled, phone_number,
               created_at_iso, last_login_at_iso, last_refresh_at_iso, password_updated_at_iso,
               valid_since, password_hash, password_salt, hash_version, raw_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
              email=VALUES(email), display_name=VALUES(display_name), email_verified=VALUES(email_verified),
              disabled=VALUES(disabled), phone_number=VALUES(phone_number), created_at_iso=VALUES(created_at_iso),
              last_login_at_iso=VALUES(last_login_at_iso), last_refresh_at_iso=VALUES(last_refresh_at_iso),
              password_updated_at_iso=VALUES(password_updated_at_iso), valid_since=VALUES(valid_since),
              password_hash=VALUES(password_hash), password_salt=VALUES(password_salt),
              hash_version=VALUES(hash_version), raw_json=VALUES(raw_json), imported_at=CURRENT_TIMESTAMP()
        `, [
            optional(user.localId), optional(user.email), optional(user.displayName), bool(user.emailVerified), bool(user.disabled),
            optional(user.phoneNumber), optional(user.createdAt), optional(user.lastLoginAt), optional(user.lastRefreshAt),
            optional(user.passwordUpdatedAt), optional(user.validSince), optional(user.passwordHash), optional(user.salt),
            optional(user.version), JSON.stringify(user)
        ]);
    }

    const collectionDir = path.join(backupDir, 'firestore');
    const collections = (await fs.readdir(collectionDir, { withFileTypes: true }))
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
        .sort();
    for (const collectionName of collections) {
        const data = await readJson(path.join(collectionDir, collectionName, 'documents.json'));
        for (const document of data.documents || []) {
            const documentId = String(document.name || '').split('/').pop();
            if (!documentId) throw new Error(`缺少文档 ID：${collectionName}`);
            await db.execute(`
                INSERT INTO firestore_documents
                  (collection_name, document_id, document_name, fields_json, create_time_iso, update_time_iso, raw_json)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                  document_name=VALUES(document_name), fields_json=VALUES(fields_json),
                  create_time_iso=VALUES(create_time_iso), update_time_iso=VALUES(update_time_iso),
                  raw_json=VALUES(raw_json), imported_at=CURRENT_TIMESTAMP()
            `, [
                collectionName, documentId, optional(document.name), JSON.stringify(document.fields || {}),
                optional(document.createTime), optional(document.updateTime), JSON.stringify(document)
            ]);

            if (collectionName === 'users') {
                const fields = document.fields || {};
                const value = (key, fallback = '') => {
                    const field = fields[key];
                    if (!field) return fallback;
                    if (Object.hasOwn(field, 'stringValue')) return field.stringValue || fallback;
                    if (Object.hasOwn(field, 'booleanValue')) return field.booleanValue === true;
                    return fallback;
                };
                await db.execute(`
                    INSERT INTO user_profiles
                      (uid, name, email, phone, school, is_admin, joined_at_iso, raw_json)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                      name=VALUES(name), email=VALUES(email), phone=VALUES(phone), school=VALUES(school),
                      is_admin=VALUES(is_admin), joined_at_iso=VALUES(joined_at_iso), raw_json=VALUES(raw_json),
                      imported_at=CURRENT_TIMESTAMP()
                `, [
                    documentId, String(value('name')), String(value('email')), String(value('phone')), String(value('school')),
                    bool(value('isAdmin')), String(value('joinedAt')), JSON.stringify(document)
                ]);
            }
        }
    }

    const counts = {};
    for (const table of ['auth_users', 'user_profiles', 'firestore_documents']) {
        const [rows] = await db.query(`SELECT COUNT(*) AS count FROM \`${table}\``);
        counts[table] = Number(rows[0].count);
    }
    await db.execute(`
        INSERT INTO migration_meta (meta_key, meta_value)
        VALUES ('firebase_import', ?)
        ON DUPLICATE KEY UPDATE meta_value=VALUES(meta_value), updated_at=CURRENT_TIMESTAMP()
    `, [JSON.stringify({ importedAt: new Date().toISOString(), sourceManifest: manifest, counts })]);
    await db.commit();
    console.log(JSON.stringify({ ok: true, sourceAuthUsers: authFile.users?.length || 0, sourceCollections: manifest.firestoreCollectionCount, counts }, null, 2));
} catch (error) {
    await db.rollback();
    throw error;
} finally {
    await db.end();
}
