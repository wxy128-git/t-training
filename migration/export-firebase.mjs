import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const outputDir = process.argv[2] ? path.resolve(process.argv[2]) : '';
if (!outputDir) throw new Error('用法：node migration/export-firebase.mjs <new-backup-dir>');

function serviceAccountFromEnv() {
    const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
    if (!raw) throw new Error('缺少 FIREBASE_SERVICE_ACCOUNT');
    for (const candidate of [raw, Buffer.from(raw, 'base64').toString('utf8')]) {
        try {
            const parsed = JSON.parse(candidate);
            if (parsed.project_id && parsed.client_email && parsed.private_key) return parsed;
        } catch {}
    }
    throw new Error('FIREBASE_SERVICE_ACCOUNT 格式无效');
}

function base64Url(value) { return Buffer.from(value).toString('base64url'); }

async function accessToken(serviceAccount) {
    const now = Math.floor(Date.now() / 1000);
    const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = base64Url(JSON.stringify({
        iss: serviceAccount.client_email,
        scope: 'https://www.googleapis.com/auth/cloud-platform',
        aud: serviceAccount.token_uri || 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600
    }));
    const unsigned = `${header}.${claims}`;
    const signature = crypto.sign('RSA-SHA256', Buffer.from(unsigned), serviceAccount.private_key).toString('base64url');
    const response = await fetch(serviceAccount.token_uri || 'https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }),
        signal: AbortSignal.timeout(15000)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.access_token) throw new Error(`无法获取 Google 访问令牌（HTTP ${response.status}）`);
    return data.access_token;
}

async function googleJson(url, token, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(options.headers || {}) },
        signal: AbortSignal.timeout(30000)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Google API 请求失败（HTTP ${response.status}）：${data.error?.message || url}`);
    return data;
}

async function listAuthUsers(projectId, token) {
    const users = []; let nextPageToken = '';
    do {
        const url = new URL(`https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/accounts:batchGet`);
        url.searchParams.set('maxResults', '1000');
        if (nextPageToken) url.searchParams.set('nextPageToken', nextPageToken);
        const data = await googleJson(url, token);
        users.push(...(data.users || []));
        nextPageToken = data.nextPageToken || '';
    } while (nextPageToken);
    const ids = new Set(users.map(user => user.localId));
    if (ids.size !== users.length || ids.has(undefined)) throw new Error('Firebase Auth 导出存在重复或缺失 UID');
    return users.sort((a, b) => String(a.localId).localeCompare(String(b.localId)));
}

async function listTopLevelCollections(projectId, token) {
    const endpoint = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents:listCollectionIds`;
    const ids = []; let pageToken = '';
    do {
        const data = await googleJson(endpoint, token, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pageSize: 1000, ...(pageToken ? { pageToken } : {}) })
        });
        ids.push(...(data.collectionIds || []));
        pageToken = data.nextPageToken || '';
    } while (pageToken);
    return [...new Set(ids)].sort();
}

async function listDocuments(projectId, collectionId, token) {
    const documents = []; let pageToken = '';
    do {
        const url = new URL(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/${encodeURIComponent(collectionId)}`);
        url.searchParams.set('pageSize', '1000');
        url.searchParams.set('orderBy', '__name__');
        if (pageToken) url.searchParams.set('pageToken', pageToken);
        const data = await googleJson(url, token);
        documents.push(...(data.documents || []));
        pageToken = data.nextPageToken || '';
    } while (pageToken);
    const names = new Set(documents.map(document => document.name));
    if (names.size !== documents.length || names.has(undefined)) throw new Error(`${collectionId} 导出存在重复或缺失文档名`);
    return documents.sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

async function writeProtected(file, data) {
    await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    await fs.chmod(file, 0o600);
}

const existing = await fs.stat(outputDir).catch(() => null);
if (existing) {
    if (!existing.isDirectory()) throw new Error('备份目标不是目录');
    if ((await fs.readdir(outputDir)).length) throw new Error('备份目标必须不存在或为空');
} else {
    await fs.mkdir(outputDir, { recursive: true, mode: 0o700 });
}
await fs.chmod(outputDir, 0o700);

const serviceAccount = serviceAccountFromEnv();
const projectId = serviceAccount.project_id;
const token = await accessToken(serviceAccount);
const users = await listAuthUsers(projectId, token);
await writeProtected(path.join(outputDir, 'firebase-auth-users.json'), { users });

const collectionIds = await listTopLevelCollections(projectId, token);
const collectionCounts = {};
for (const collectionId of collectionIds) {
    const documents = await listDocuments(projectId, collectionId, token);
    collectionCounts[collectionId] = documents.length;
    await writeProtected(path.join(outputDir, 'firestore', collectionId, 'documents.json'), { documents });
}

const relativeFiles = ['firebase-auth-users.json'];
for (const collectionId of collectionIds) relativeFiles.push(path.join('firestore', collectionId, 'documents.json'));
const files = [];
for (const relative of relativeFiles) {
    const bytes = await fs.readFile(path.join(outputDir, relative));
    files.push({ path: relative, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
}
const manifest = {
    project: projectId,
    database: '(default)',
    exportedAt: new Date().toISOString(),
    authUserCount: users.length,
    authHashFieldsVisible: users.filter(user => user.passwordHash).length,
    firestoreCollectionCount: collectionIds.length,
    firestoreDocumentCount: Object.values(collectionCounts).reduce((sum, count) => sum + count, 0),
    firestoreCollections: collectionCounts,
    files
};
await writeProtected(path.join(outputDir, 'manifest.json'), manifest);
console.log(JSON.stringify({ ok: true, outputDir, authUsers: manifest.authUserCount, collections: manifest.firestoreCollectionCount, documents: manifest.firestoreDocumentCount, files: files.length + 1 }, null, 2));
