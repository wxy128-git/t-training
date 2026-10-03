// Offline SQL substitute for tests/local preview only; never imported by production.
import mysql from 'mysql2/promise';
import { issueLocalSession } from '../../server/local-auth-store.mjs';
import { encodeFields, decodeFields } from '../../server/local-firestore-store.mjs';
export async function adminFixture() {
    let documents = new Map(), snapshot;
    let sessions = new Map(), metadata = new Map(), actionTokens = new Map(), profiles = new Map();
    const adminUid = 'MCUSTieySYczODKB9hkERtyvtZG2';
    let users = [adminUid, 'teacher'].map(uid => ({ uid, email: `${uid}@example.invalid`, email_verified: 1, name: '演示用户（虚构）', school: '演示学校', joined_at_iso: '2026-10-01T00:00:00Z' }));
    const state = { failId: '', failRead: '', commits: 0, rollbacks: 0 };
    let unlock, tail = Promise.resolve();
    async function execute(sql, p = []) {
        if (sql.includes('GET_LOCK')) { const prior = tail; tail = new Promise(resolve => { unlock = resolve; }); const release = unlock; await prior; state.releaseLock = release; return [[{ acquired: 1 }]]; }
        if (sql.includes('RELEASE_LOCK')) { state.releaseLock(); return [[{ released: 1 }]]; }
        if (sql.includes('INSERT INTO auth_sessions')) { sessions.set(p[0], p[1]); return [{}]; }
        if (sql.includes('FROM auth_sessions')) return [[...(sessions.has(p[0]) && sessions.get(p[0]) === p[1] ? [{ session_id: p[0] }] : [])]];
        if (sql.includes('FROM auth_users') && sql.includes('SELECT')) {
            if (/uid\s*<>/.test(sql)) return [users.filter(user => user.email === p[0] && user.uid !== p[1])];
            if (/WHERE (?:a\.)?uid/.test(sql)) return [users.filter(user => user.uid === p[0])];
            if (sql.includes('LOWER(a.email)')) return [users.filter(user => user.email.toLowerCase() === p[0].toLowerCase())];
            return [users];
        }
        if (sql.includes('FROM migration_meta')) return [metadata.has(p[0]) ? [{ meta_key: p[0], meta_value: metadata.get(p[0]) }] : []];
        if (sql.startsWith('INSERT INTO migration_meta')) { metadata.set(p[0], p[1]); return [{ affectedRows: 1 }]; }
        if (sql.includes('INSERT INTO auth_users')) {
            const local = sql.includes('local_password_hash');
            if (local && users.some(u => u.email === p[1])) throw Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' });
            const row = { uid: p[0], email: p[1], display_name: p[2], email_verified: local ? 0 : p[3], raw_json: local ? p[7] : p[10],
                ...(local ? { local_password_hash: p[4], local_password_salt: p[5], local_password_scheme: p[6] } : {}) };
            const prior = users.find(u => u.uid === p[0]);
            if (prior) Object.assign(prior, row); else users.push(row);
            return [{ affectedRows: 1 }];
        }
        if (sql.includes('INSERT INTO user_profiles')) {
            const profile = { uid: p[0], name: p[1], email: p[2], phone: p[3], school: p[4] };
            profiles.set(p[0], profile); Object.assign(users.find(u => u.uid === p[0]) || {}, profile);
            return [{ affectedRows: 1 }];
        }
        if (sql.startsWith('DELETE FROM auth_sessions')) { for (const [id, uid] of sessions) if (uid === p[0]) sessions.delete(id); return [{}]; }
        if (sql.startsWith('DELETE FROM auth_action_tokens')) { for (const [id, token] of actionTokens) if (token.uid === p[0]) actionTokens.delete(id); return [{}]; }
        if (sql.startsWith('DELETE FROM user_profiles')) { profiles.delete(p[0]); return [{}]; }
        if (sql.includes('SELECT') && sql.includes('FROM user_profiles')) return [profiles.has(p[0]) ? [profiles.get(p[0])] : []];
        if (sql.startsWith('DELETE FROM auth_users')) {
            if (state.failDelete) throw new Error('模拟删除中断');
            users = users.filter(u => u.uid !== p[0]); return [{}];
        }
        if (sql.includes('FROM auth_action_tokens')) return [actionTokens.has(p[0]) ? [actionTokens.get(p[0])] : []];
        if (sql.includes('COUNT(*) AS total')) {
            const counts = new Map();
            for (const doc of documents.values()) {
                const value = decodeFields(JSON.parse(doc.fields_json));
                if (['users','analytics_events','contact_messages','subscribers'].includes(doc.collection_name)) continue;
                if ([value.uid,value.userId,value.authorId].includes(p[0])) counts.set(doc.collection_name,(counts.get(doc.collection_name)||0)+1);
            }
            return [[...counts].map(([collection_name,total])=>({collection_name,total}))];
        }
        if (sql.includes('SELECT') && sql.includes('FROM firestore_documents')) {
            if (state.failRead === p[0]) throw new Error('模拟读取失败');
            return [[...documents.values()].filter(row => row.collection_name === p[0] && (p.length === 1 || row.document_id === p[1])).sort((a,b) => a.document_id.localeCompare(b.document_id))];
        }
        if (sql.includes('INSERT INTO firestore_documents')) {
            if (state.failId === p[1]) throw new Error('模拟写入中断');
            documents.set(`${p[0]}/${p[1]}`, { collection_name: p[0], document_id: p[1], fields_json: p[3] }); return [{}];
        }
        if (sql.startsWith('DELETE FROM firestore_documents')) { documents.delete(sql.includes("collection_name = 'users'") ? `users/${p[0]}` : `${p[0]}/${p[1]}`); return [{}]; }
        throw new Error('未模拟的 SQL: ' + sql);
    }
    const connection = { execute, beginTransaction: async () => { snapshot = structuredClone({documents,users,sessions,metadata,actionTokens,profiles}); }, commit: async () => { state.commits++; }, rollback: async () => { ({documents,users,sessions,metadata,actionTokens,profiles} = snapshot); state.rollbacks++; }, release() {} };
    mysql.createPool = () => ({ execute, getConnection: async () => connection });
    const env = { T_TRAINING_DB_NAME: 'offline_admin_fixture', T_TRAINING_DB_PASSWORD: 'fixture-only', T_TRAINING_AUTH_SECRET: 'offline-fixture-secret-00000000000000000' };
    const token = (await issueLocalSession(env, adminUid)).idToken;
    const teacherToken = (await issueLocalSession(env, 'teacher')).idToken;
    function seed(collection, id, data) { documents.set(`${collection}/${id}`, { collection_name: collection, document_id: id, fields_json: JSON.stringify(encodeFields(data)) }); }
    return { env, token, teacherToken, seed, state, get users() { return users; },
        seedAction: async (id, uid) => actionTokens.set(id, { uid }), setDeleteFailure: async fail => { state.failDelete = fail; }, get actionTokens() { return actionTokens; }, get profiles() { return profiles; },
        setWriteFailure: async id => { state.failId = id; }, setReadFailure: async type => { state.failRead = type; } };
}
