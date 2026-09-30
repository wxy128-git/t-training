#!/usr/bin/env node
// MariaDB only. Never connects to Firebase. Requires explicit loopback DB settings.
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open, realpath } from 'node:fs/promises';
import { resolve, dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

export const PERSONAL_FIELDS = Object.freeze(['userEmail','userPhone','userName','userSchool']);
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const batchSize = 250;

function decode(row) {
    try {
        const fields = JSON.parse(row.fields_json);
        const raw = JSON.parse(row.raw_json);
        if (!fields || Array.isArray(fields) || typeof fields !== 'object' || !raw || Array.isArray(raw) || typeof raw !== 'object') throw new Error();
        if (raw.fields !== undefined && (!raw.fields || Array.isArray(raw.fields) || typeof raw.fields !== 'object')) throw new Error();
        return { fields, raw };
    } catch { throw new Error('事件中存在无效数据，已停止；请先修复数据格式。未输出事件内容。'); }
}
export function scrubRow(row) {
    const { fields, raw } = decode(row);
    for (const key of PERSONAL_FIELDS) {
        delete fields[key];
        if (raw.fields) delete raw.fields[key];
    }
    return { fields_json:JSON.stringify(fields), raw_json:JSON.stringify(raw) };
}
function affected(row) {
    const { fields, raw } = decode(row);
    return PERSONAL_FIELDS.filter(key => Object.hasOwn(fields,key) || Object.hasOwn(raw.fields || {},key));
}
async function scan(connection, visit, lock = false) {
    let cursor = null;
    for (;;) {
        const [rows] = await connection.execute(`SELECT * FROM firestore_documents
            WHERE collection_name = 'analytics_events' ${cursor === null ? '' : 'AND document_id > ?'}
            ORDER BY document_id LIMIT ${batchSize} ${lock ? 'FOR UPDATE' : ''}`, cursor === null ? [] : [cursor]);
        for (const row of rows) await visit(row);
        if (rows.length < batchSize) break;
        cursor = rows.at(-1).document_id;
    }
}
async function prepareBackup(directory) {
    if (!directory) throw new Error('执行清理必须提供 --backup-dir；脚本会先完成备份并校验，再修改数据。');
    const parent = await realpath(dirname(resolve(directory)));
    const actual = join(parent, resolve(directory).split(sep).at(-1));
    const root = await realpath(projectRoot);
    if (actual === root || actual.startsWith(root + sep)) throw new Error('备份必须保存在项目目录之外，避免进入网站或版本库。');
    await mkdir(actual, {mode:0o700}); // EEXIST intentionally rejects overwrite and symlinks.
    return { directory:actual, file:await open(join(actual,'analytics-events.jsonl'),'wx',0o600) };
}

export async function cleanAnalytics(pool, { execute = false, backupDir, database = '' } = {}) {
    if (execute && !backupDir) throw new Error('执行前必须指定备份目录。');
    const connection = await pool.getConnection();
    let backup, locked = false;
    const result = { mode:execute ? 'execute' : 'dry-run', scanned:0, affected:0, changed:0,
        fields:Object.fromEntries(PERSONAL_FIELDS.map(key=>[key,0])) };
    try {
        const [tables] = await connection.query("SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'firestore_documents'");
        if (tables[0]?.ENGINE?.toUpperCase() !== 'INNODB') throw new Error('清理要求 InnoDB 表，以确保失败时可以撤回全部修改。');
        if (execute) {
            const [rows] = await connection.query("SELECT GET_LOCK('analytics_privacy_cleanup', 0) AS acquired");
            if (Number(rows[0].acquired) !== 1) throw new Error('另一个清理任务正在执行。');
            locked = true;
        }
        await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
        await connection.beginTransaction();
        if (execute) backup = await prepareBackup(backupDir);
        const hash = createHash('sha256');
        await scan(connection, async row => {
            const keys = affected(row);
            result.scanned++;
            if (keys.length) result.affected++;
            for (const key of keys) result.fields[key]++;
            if (backup) {
                const line = JSON.stringify(row) + '\n';
                hash.update(line);
                await backup.file.writeFile(line);
            }
        }, execute);
        if (backup) {
            await backup.file.sync();
            await backup.file.close();
            backup.file = null;
            const expected = hash.digest('hex');
            const verification = createHash('sha256');
            for await (const chunk of createReadStream(join(backup.directory,'analytics-events.jsonl'))) verification.update(chunk);
            if (verification.digest('hex') !== expected) throw new Error('备份校验失败，未执行清理。');
            const manifest = await open(join(backup.directory,'manifest.json'),'wx',0o600);
            try {
                await manifest.writeFile(JSON.stringify({version:1,database,collection:'analytics_events',rows:result.scanned,
                    affected:result.affected,sha256:expected,createdAt:new Date().toISOString(),status:'backup-verified'},null,2)+'\n');
                await manifest.sync();
            } finally { await manifest.close(); }
            for (const directory of [backup.directory, dirname(backup.directory)]) {
                const handle = await open(directory, 'r');
                try { await handle.sync(); } finally { await handle.close(); }
            }
            // No UPDATE is allowed before both the data and verified manifest are durable.
            await scan(connection, async row => {
                if (!affected(row).length) return;
                const cleaned = scrubRow(row);
                const [updated] = await connection.execute(`UPDATE firestore_documents SET fields_json = ?, raw_json = ?
                    WHERE collection_name = 'analytics_events' AND document_id = ?`,
                    [cleaned.fields_json,cleaned.raw_json,row.document_id]);
                if (updated.affectedRows !== 1) throw new Error('清理影响条数不符，已回滚。');
                result.changed++;
            });
            await scan(connection, row => { if (affected(row).length) throw new Error('清理后仍有残留，已回滚。'); });
        }
        await connection.commit();
        return {...result,remaining:execute ? 0 : result.affected};
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        await backup?.file?.close();
        if (locked) await connection.query("SELECT RELEASE_LOCK('analytics_privacy_cleanup')");
        connection.release();
    }
}

async function main() {
    const args = process.argv.slice(2);
    if (args.includes('--help')) {
        console.log('只检查：node scripts/clean-analytics-personal-fields.mjs --dry-run\n清理：node scripts/clean-analytics-personal-fields.mjs --execute --backup-dir /绝对路径/新备份目录\n必须显式提供 ANALYTICS_CLEANUP_DB_HOST/PORT/NAME/USER/PASSWORD 环境变量。仅允许本机数据库，不读取生产配置。');
        return;
    }
    const execute = args[0] === '--execute';
    const valid = (args.length === 1 && args[0] === '--dry-run') ||
        (args.length === 3 && execute && args[1] === '--backup-dir' && args[2]?.startsWith('/'));
    if (!valid) throw new Error('必须明确使用 --dry-run，或 --execute --backup-dir /绝对路径/新目录。');
    const env = process.env;
    const config = {host:env.ANALYTICS_CLEANUP_DB_HOST,port:Number(env.ANALYTICS_CLEANUP_DB_PORT),
        database:env.ANALYTICS_CLEANUP_DB_NAME,user:env.ANALYTICS_CLEANUP_DB_USER,password:env.ANALYTICS_CLEANUP_DB_PASSWORD};
    if (!['127.0.0.1','::1','localhost'].includes(config.host) || !Number.isInteger(config.port) || config.port < 1 || config.port > 65535 ||
        !config.database || !config.user || !config.password) throw new Error('请显式提供完整的本机数据库配置；不允许远程主机或默认生产配置。');
    const pool = mysql.createPool({...config,connectionLimit:1});
    try { console.log(JSON.stringify(await cleanAnalytics(pool,{execute,backupDir:execute ? args[2] : undefined,database:config.database}),null,2)); }
    finally { await pool.end(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch(error => { console.error(error.code ? `清理未完成（${error.code}），请检查配置或备份目录，并用 --dry-run 核对状态。` : error.message); process.exitCode=1; });
}
