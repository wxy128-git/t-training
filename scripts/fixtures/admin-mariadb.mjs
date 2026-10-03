// Explicit, isolated integration fixture. Never reads production environment files.
import mysql from 'mysql2/promise';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { getPool, issueLocalSession } from '../../server/local-auth-store.mjs';
import { upsertDocument, withDocumentTransaction } from '../../server/local-firestore-store.mjs';
export async function adminFixture() {
    if (process.env.ADMIN_TEST_ALLOW_CREATE !== 'yes' || !process.env.ADMIN_TEST_SOCKET) throw new Error('必须显式授权创建隔离库并指定本机 MariaDB socket');
    const suffix = randomBytes(6).toString('hex');
    const database = `admin_qa_${suffix}`, user = `admin_qa_${suffix}`, password = randomBytes(24).toString('hex');
    const root = await mysql.createConnection({ socketPath: process.env.ADMIN_TEST_SOCKET, user: 'root' });
    const env = { T_TRAINING_DB_HOST: '127.0.0.1', T_TRAINING_DB_PORT: '3306', T_TRAINING_DB_NAME: database,
        T_TRAINING_DB_USER: user, T_TRAINING_DB_PASSWORD: password, T_TRAINING_AUTH_SECRET: randomBytes(32).toString('hex') };
    let pool, createdDb = false, createdUser = false;
    async function cleanup() {
        try {
            if (pool) await pool.end();
            if (createdDb) await root.query(`DROP DATABASE \`${database}\``);
            if (createdUser) await root.query(`DROP USER '${user}'@'localhost'`);
            console.log('隔离测试库、测试账号和虚构数据已清理。');
        } finally { await root.end(); }
    }
    try {
        await root.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`); createdDb = true;
        await root.query(`CREATE USER '${user}'@'localhost' IDENTIFIED BY '${password}'`); createdUser = true;
        await root.query(`GRANT ALL ON \`${database}\`.* TO '${user}'@'localhost'`);
        pool = getPool(env);
        const schema = await readFile(new URL('../../migration/schema.sql', import.meta.url), 'utf8');
        for (const statement of schema.slice(schema.indexOf('CREATE TABLE')).split(';').map(s => s.trim()).filter(Boolean)) await pool.query(statement);
        const adminUid = 'MCUSTieySYczODKB9hkERtyvtZG2';
        for (const uid of [adminUid, 'teacher']) {
            await pool.execute('INSERT INTO auth_users (uid,email,email_verified,raw_json) VALUES (?,?,1,?)',[uid,`${uid}@example.invalid`,'{}']);
            await pool.execute('INSERT INTO user_profiles (uid,name,raw_json) VALUES (?,?,?)',[uid,'虚构教师','{}']);
        }
        const token = (await issueLocalSession(env, adminUid)).idToken;
        const teacherToken = (await issueLocalSession(env, 'teacher')).idToken;
        return { env, token, teacherToken, realDatabase: true, cleanup,
            seed: (collection,id,data) => upsertDocument(env,collection,id,data),
            setWriteFailure: async id => {
                await pool.query('DROP TRIGGER IF EXISTS qa_fail_write');
                if (id) {
                    assert.equal(id, 'broken');
                    await pool.query("CREATE TRIGGER qa_fail_write BEFORE INSERT ON firestore_documents FOR EACH ROW BEGIN IF NEW.document_id='broken' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='QA injected failure'; END IF; END");
                }
            },
            setReadFailure: async type => {
                await pool.query(type ? 'RENAME TABLE firestore_documents TO qa_hidden_documents' : 'RENAME TABLE qa_hidden_documents TO firestore_documents');
            },
            testLock: async () => {
                const competitor = await pool.getConnection();
                const lock = `admin-content:${database}`;
                try {
                    await withDocumentTransaction(env, async () => {
                        const [rows] = await competitor.execute('SELECT GET_LOCK(?,0) AS acquired',[lock]);
                        assert.equal(Number(rows[0].acquired),0);
                    });
                    const [rows] = await competitor.execute('SELECT GET_LOCK(?,0) AS acquired',[lock]);
                    assert.equal(Number(rows[0].acquired),1);
                } finally { await competitor.execute('SELECT RELEASE_LOCK(?)',[lock]); competitor.release(); }
            }
        };
    } catch (error) { await cleanup(); throw error; }
}
