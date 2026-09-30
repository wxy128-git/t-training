#!/usr/bin/env node
// Read-only local assessment. Uses explicit test credentials, never default production env.
import mysql from 'mysql2/promise';
import {expireAnalytics} from '../server/analytics-retention.mjs';
if(process.argv.length!==3||process.argv[2]!=='--dry-run')throw new Error('仅支持 --dry-run，不在此脚本执行删除');
const e=process.env;
if(e.ANALYTICS_CLEANUP_DB_HOST!=='127.0.0.1'||!e.ANALYTICS_CLEANUP_DB_NAME||!e.ANALYTICS_CLEANUP_DB_USER||!e.ANALYTICS_CLEANUP_DB_PASSWORD)throw new Error('必须显式配置本机测试库 ANALYTICS_CLEANUP_DB_*，HOST 仅允许 127.0.0.1');
const pool=mysql.createPool({host:'127.0.0.1',port:Number(e.ANALYTICS_CLEANUP_DB_PORT||3306),database:e.ANALYTICS_CLEANUP_DB_NAME,user:e.ANALYTICS_CLEANUP_DB_USER,password:e.ANALYTICS_CLEANUP_DB_PASSWORD});
try{console.log(JSON.stringify(await expireAnalytics(pool),null,2));}finally{await pool.end();}
