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
const reconcile = process.env.T_TRAINING_IMPORT_RECONCILE === '1';
if (!Array.isArray(authFile.users) || Number(manifest.authUserCount) !== authFile.users.length) {
    throw new Error('Auth 快照数量与 manifest 不一致，拒绝导入');
}

await db.beginTransaction();
try {
    if (reconcile) {
        await db.query('CREATE TEMPORARY TABLE source_auth_uids (uid varchar(128) NOT NULL PRIMARY KEY) ENGINE=MEMORY');
        await db.query('CREATE TEMPORARY TABLE source_profile_uids (uid varchar(128) NOT NULL PRIMARY KEY) ENGINE=MEMORY');
        await db.query('CREATE TEMPORARY TABLE source_firestore_keys (collection_name varchar(128) NOT NULL, document_id varchar(255) NOT NULL, PRIMARY KEY (collection_name, document_id)) ENGINE=InnoDB');
    }
    for (const user of authFile.users || []) {
        if (reconcile) await db.execute('INSERT INTO source_auth_uids (uid) VALUES (?)', [optional(user.localId)]);
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
            if (reconcile) await db.execute('INSERT INTO source_firestore_keys (collection_name, document_id) VALUES (?, ?)', [collectionName, documentId]);
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
                if (reconcile) await db.execute('INSERT INTO source_profile_uids (uid) VALUES (?)', [documentId]);
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

    const removed = { authUsers: 0, userProfiles: 0, firestoreDocuments: 0, authSessions: 0 };
    if (reconcile) {
        const [sessionResult] = await db.query('DELETE s FROM auth_sessions s LEFT JOIN source_auth_uids src ON src.uid=s.uid WHERE src.uid IS NULL');
        const [profileResult] = await db.query('DELETE p FROM user_profiles p LEFT JOIN source_profile_uids src ON src.uid=p.uid WHERE src.uid IS NULL');
        const [authResult] = await db.query('DELETE a FROM auth_users a LEFT JOIN source_auth_uids src ON src.uid=a.uid WHERE src.uid IS NULL');
        const [documentResult] = await db.query('DELETE d FROM firestore_documents d LEFT JOIN source_firestore_keys src ON src.collection_name=d.collection_name AND src.document_id=d.document_id WHERE src.document_id IS NULL');
        removed.authSessions = Number(sessionResult.affectedRows || 0);
        removed.userProfiles = Number(profileResult.affectedRows || 0);
        removed.authUsers = Number(authResult.affectedRows || 0);
        removed.firestoreDocuments = Number(documentResult.affectedRows || 0);
    }

    const counts = {};
    for (const table of ['auth_users', 'user_profiles', 'firestore_documents']) {
        const [rows] = await db.query(`SELECT COUNT(*) AS count FROM \`${table}\``);
        counts[table] = Number(rows[0].count);
    }
    const sourceDocumentCount = Number(manifest.firestoreDocumentCount ?? Object.values(manifest.firestoreCollections || {}).reduce((sum, value) => sum + Number(value?.documents ?? value ?? 0), 0));
    if (reconcile && (counts.auth_users !== authFile.users.length || counts.firestore_documents !== sourceDocumentCount)) {
        throw new Error(`镜像核对失败：Auth ${counts.auth_users}/${authFile.users.length}，Firestore ${counts.firestore_documents}/${sourceDocumentCount}`);
    }
    await db.execute(`
        INSERT INTO migration_meta (meta_key, meta_value)
        VALUES ('firebase_import', ?)
        ON DUPLICATE KEY UPDATE meta_value=VALUES(meta_value), updated_at=CURRENT_TIMESTAMP()
    `, [JSON.stringify({ importedAt: new Date().toISOString(), sourceManifest: manifest, reconcile, removed, counts })]);
    await db.commit();
    console.log(JSON.stringify({ ok: true, reconcile, sourceAuthUsers: authFile.users?.length || 0, sourceCollections: manifest.firestoreCollectionCount, sourceDocuments: sourceDocumentCount, removed, counts }, null, 2));
} catch (error) {
    await db.rollback();
    throw error;
} finally {
    await db.end();
}
