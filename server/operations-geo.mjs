// Offline lookup only. Request IPs are neither cached nor persisted by this module.
import {BlockList,isIP} from 'node:net';
import {fileURLToPath} from 'node:url';
import {IPv4,IPv6,parseIP,verifyFromFile,loadContentFromFile,newWithBuffer} from 'ip2region.js';

const excluded=new BlockList();
for(const [ip,bits] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]])excluded.addSubnet(ip,bits,'ipv4');
for(const [ip,bits] of [['::',128],['::1',128],['fc00::',7],['fe80::',10],['ff00::',8],['2001:db8::',32]])excluded.addSubnet(ip,bits,'ipv6');
const searchers=new Map();
export const unknownGeo=()=>({country:'未知',region:'未知',city:'未知'});
const clean=value=>typeof value==='string'&&value!=='0'&&value.length<=64&&!/[\u0000-\u001f\u007f<>|]/.test(value)?value:'未知';

export async function locateOperation(ip) {
    try {
        if(typeof ip==='string'&&/^::ffff:/i.test(ip)&&isIP(ip.slice(7))===4)ip=ip.slice(7);
        let version=isIP(ip);
        if(!version)return unknownGeo();
        if(version===6){
            const bytes=parseIP(ip);
            if(bytes.subarray(0,10).every(n=>n===0)&&bytes[10]===255&&bytes[11]===255){ip=[...bytes.subarray(12)].join('.');version=4;}
        }
        if(excluded.check(ip,version===4?'ipv4':'ipv6'))return unknownGeo();
        if(!searchers.has(version)){
            try{
                const file=fileURLToPath(new URL(`./geo-data/ip2region_v${version}.xdb`,import.meta.url));
                verifyFromFile(file);
                searchers.set(version,newWithBuffer(version===4?IPv4:IPv6,loadContentFromFile(file)));
            }catch{searchers.set(version,null);}
        }
        const result=await searchers.get(version)?.search(ip);
        if(!result)return unknownGeo();
        const [country,region,city]=result.split('|');
        if(!country||country==='0'||/内网|保留|私有|Reserved|Private|Loopback/i.test(country))return unknownGeo();
        return {country:clean(country),region:clean(region),city:clean(city)};
    }catch{return unknownGeo();}
}
