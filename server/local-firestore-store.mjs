import crypto from 'node:crypto';
import { getPool, readLocalAccessToken, assertCanUseFeatures, publicUser } from './local-auth-store.mjs';

function decodeValue(value) {
    if (!value || typeof value !== 'object') return null;
    if (Object.hasOwn(value, 'nullValue')) return null;
    if (Object.hasOwn(value, 'stringValue')) return value.stringValue;
    if (Object.hasOwn(value, 'integerValue')) return Number(value.integerValue);
    if (Object.hasOwn(value, 'doubleValue')) return Number(value.doubleValue);
    if (Object.hasOwn(value, 'booleanValue')) return value.booleanValue === true;
    if (Object.hasOwn(value, 'timestampValue')) return value.timestampValue;
    if (Object.hasOwn(value, 'arrayValue')) return (value.arrayValue.values || []).map(decodeValue);
    if (Object.hasOwn(value, 'mapValue')) return decodeFields(value.mapValue.fields || {});
    return null;
}

export function decodeFields(fields) {
    return Object.fromEntries(Object.entries(fields || {}).map(([key, value]) => [key, decodeValue(value)]));
}

export function decodeDocument(row) {
    let fields = {};
    try { fields = JSON.parse(row.fields_json || '{}'); } catch {}
    return { id: row.document_id, ...decodeFields(fields) };
}

function encodeValue(value) {
    if (value === null || value === undefined) return { nullValue: null };
    if (value instanceof Date) return { timestampValue: value.toISOString() };
    if (typeof value === 'boolean') return { booleanValue: value };
    if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
    if (Array.isArray(value)) return { arrayValue: { values: value.slice(0, 100).map(encodeValue) } };
    if (typeof value === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(value).slice(0, 100).map(([key, item]) => [key, encodeValue(item)])) } };
    return { stringValue: String(value) };
}

export function encodeFields(fields) {
    return Object.fromEntries(Object.entries(fields || {}).map(([key, value]) => [key, encodeValue(value)]));
}

export async function listDocuments(env, collectionName) {
    const [rows] = await getPool(env).execute(`
        SELECT collection_name, document_id, document_name, fields_json, create_time_iso, update_time_iso, raw_json
        FROM firestore_documents WHERE collection_name = ? ORDER BY document_id ASC
    `, [collectionName]);
    return rows.map(decodeDocument);
}

export async function getDocument(env, collectionName, documentId) {
    const [rows] = await getPool(env).execute(`
        SELECT collection_name, document_id, document_name, fields_json, create_time_iso, update_time_iso, raw_json
        FROM firestore_documents WHERE collection_name = ? AND document_id = ? LIMIT 1
    `, [collectionName, documentId]);
    return rows[0] ? decodeDocument(rows[0]) : null;
}

export async function upsertDocument(env, collectionName, documentId, data, options = {}) {
    const fields = options.typedFields ? data : encodeFields(data);
    const now = new Date().toISOString();
    const documentName = options.documentName || `projects/xylaoshi-28f6c/databases/(default)/documents/${collectionName}/${documentId}`;
    const raw = options.raw || { name: documentName, fields };
    await getPool(env).execute(`
        INSERT INTO firestore_documents
          (collection_name, document_id, document_name, fields_json, create_time_iso, update_time_iso, raw_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          document_name=VALUES(document_name), fields_json=VALUES(fields_json),
          update_time_iso=VALUES(update_time_iso), raw_json=VALUES(raw_json), imported_at=CURRENT_TIMESTAMP()
    `, [collectionName, documentId, documentName, JSON.stringify(fields), options.createTime || now, now, JSON.stringify(raw)]);
    return getDocument(env, collectionName, documentId);
}

export async function createDocument(env, collectionName, data, options = {}) {
    const id = options.documentId || crypto.randomUUID().replaceAll('-', '');
    await upsertDocument(env, collectionName, id, data, { ...options, documentId: id });
    return id;
}

export async function deleteDocument(env, collectionName, documentId) {
    await getPool(env).execute('DELETE FROM firestore_documents WHERE collection_name = ? AND document_id = ?', [collectionName, documentId]);
}

export async function localFeatureSession(env, idToken) {
    const session = await readLocalAccessToken(env, idToken);
    if (!session) {
        const error = new Error('登录状态已过期，请重新登录');
        error.statusCode = 401;
        error.code = 'INVALID_ID_TOKEN';
        throw error;
    }
    assertCanUseFeatures(session.user);
    return session;
}

export { publicUser };
