// Offline SQL substitute for tests/local preview only; never imported by production.
import mysql from 'mysql2/promise';
import { issueLocalSession } from '../../server/local-auth-store.mjs';
import { encodeFields } from '../../server/local-firestore-store.mjs';
export async function adminFixture() {
    let documents = new Map(), snapshot;
    const sessions = new Map();
    const adminUid = 'MCUSTieySYczODKB9hkERtyvtZG2';
    const users = [adminUid, 'teacher'].map(uid => ({ uid, email: `${uid}@example.invalid`, email_verified: 1, name: '演示用户（虚构）', school: '演示学校', joined_at_iso: '2026-10-01T00:00:00Z' }));
    const state = { failId: '', failRead: '', commits: 0, rollbacks: 0 };
    let unlock, tail = Promise.resolve();
    async function execute(sql, p = []) {
        if (sql.includes('GET_LOCK')) { const prior = tail; tail = new Promise(resolve => { unlock = resolve; }); const release = unlock; await prior; state.releaseLock = release; return [[{ acquired: 1 }]]; }
        if (sql.includes('RELEASE_LOCK')) { state.releaseLock(); return [[{ released: 1 }]]; }
        if (sql.includes('INSERT INTO auth_sessions')) { sessions.set(p[0], p[1]); return [{}]; }
        if (sql.includes('FROM auth_sessions')) return [[...(sessions.get(p[0]) === p[1] ? [{ session_id: p[0] }] : [])]];
        if (sql.includes('FROM auth_users')) return [sql.includes('WHERE a.uid') ? users.filter(user => user.uid === p[0]) : users];
        if (sql.includes('SELECT') && sql.includes('FROM firestore_documents')) {
            if (state.failRead === p[0]) throw new Error('模拟读取失败');
            return [[...documents.values()].filter(row => row.collection_name === p[0] && (p.length === 1 || row.document_id === p[1])).sort((a,b) => a.document_id.localeCompare(b.document_id))];
        }
        if (sql.includes('INSERT INTO firestore_documents')) {
            if (state.failId === p[1]) throw new Error('模拟写入中断');
            documents.set(`${p[0]}/${p[1]}`, { collection_name: p[0], document_id: p[1], fields_json: p[3] }); return [{}];
        }
        if (sql.startsWith('DELETE FROM firestore_documents')) { documents.delete(`${p[0]}/${p[1]}`); return [{}]; }
        throw new Error('未模拟的 SQL: ' + sql);
    }
    const connection = { execute, beginTransaction: async () => { snapshot = structuredClone(documents); }, commit: async () => { state.commits++; }, rollback: async () => { documents = snapshot; state.rollbacks++; }, release() {} };
    mysql.createPool = () => ({ execute, getConnection: async () => connection });
    const env = { T_TRAINING_DB_NAME: 'offline_admin_fixture', T_TRAINING_DB_PASSWORD: 'fixture-only', T_TRAINING_AUTH_SECRET: 'offline-fixture-secret-00000000000000000' };
    const token = (await issueLocalSession(env, adminUid)).idToken;
    const teacherToken = (await issueLocalSession(env, 'teacher')).idToken;
    function seed(collection, id, data) { documents.set(`${collection}/${id}`, { collection_name: collection, document_id: id, fields_json: JSON.stringify(encodeFields(data)) }); }
    return { env, token, teacherToken, seed, state, users, setWriteFailure: async id => { state.failId = id; }, setReadFailure: async type => { state.failRead = type; } };
}
