# 运营来源离线地区库

来源：[lionsoul2014/ip2region](https://github.com/lionsoul2014/ip2region)，固定提交 `1bf6cabfb63c1a14af0971749c2120a3e5c77d72`，2026-10-17 下载。
保留上游 `LICENSE.md`（Apache-2.0 OR MIT）。查询使用锁定的官方 `ip2region.js@3.1.8`。

| 文件 | SHA-256 |
| --- | --- |
| ip2region_v4.xdb | 27ecba8c9a6d5e3b280aedbe7ee15c65372b179fbd0dad3845d8c608f2fcace1 |
| ip2region_v6.xdb | 939f6b46bd2b8bec3cf7c5ceb8ba782266ae9b1f35b5ba7916700dec0b7506ed |

只打包到 API 服务端，禁止放入静态站、浏览器预缓存或在线查询 API。IP 只在内存中用于离线查询；运营表只保存国家／地区、省份、城市三个标签，丢弃 IP 和运营商。
这是 IP 网络出口估算，不是用户实时位置；库更新不定期。更新时必须同时固定上游提交、重新记录哈希、执行 IPv4 / IPv6 回归，并保留许可证。
