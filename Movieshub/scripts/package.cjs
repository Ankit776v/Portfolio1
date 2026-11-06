// Dependency-free, source-only ZIP. Never follows symlinks or includes secrets/build caches.
const fs = require('node:fs');
const path = require('node:path');
const root=path.resolve(__dirname,'..');
const excluded=new Set(['node_modules','dist','.git','.vscode','.agents','.codex','.aws','artifacts','test-results','playwright-report']);
function safeFile(name) { return name === '.env.example' || (!/^\.env(?:\.|$)/i.test(name) && !/\.(?:log|zip|pem|key|pfx|p12)$/i.test(name) && name !== 'suggestion.txt'); }
function files(dir=root) {
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry => {
    if (entry.isSymbolicLink() || excluded.has(entry.name) || !safeFile(entry.name)) return [];
    const absolute=path.join(dir,entry.name);
    return entry.isDirectory() ? files(absolute) : entry.isFile() ? [absolute] : [];
  });
}
const table=Array.from({length:256},(_,i)=>{let c=i;for(let j=0;j<8;j++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function crc32(data) { let crc=0xffffffff;for(const byte of data)crc=table[(crc^byte)&255]^(crc>>>8);return (crc^0xffffffff)>>>0; }
function makeArchive() {
  const local=[],central=[]; let offset=0;
  const entries=files().sort();
  for(const absolute of entries) {
    const relative=path.relative(root,absolute).replaceAll('\\','/');
    if (!relative.startsWith('docs/screenshots/') && !/\.(?:png|jpe?g|webp|ico|webm)$/i.test(relative)) {
      const text=fs.readFileSync(absolute,'utf8');
      if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text) || /(?:API_KEY|api_key|JWT_SECRET|CLIENT_SECRET)\s*[:=]\s*["'][a-f\d]{32,}["']/i.test(text)) throw new Error('Potential credential in '+relative+'; archive was not produced.');
    }
    const name=Buffer.from(relative),data=fs.readFileSync(absolute),crc=crc32(data);
    const header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50,0);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt16LE(33,12);header.writeUInt32LE(crc,14);header.writeUInt32LE(data.length,18);header.writeUInt32LE(data.length,22);header.writeUInt16LE(name.length,26);
    local.push(header,name,data);
    const record=Buffer.alloc(46);record.writeUInt32LE(0x02014b50,0);record.writeUInt16LE(20,4);record.writeUInt16LE(20,6);record.writeUInt16LE(0x800,8);record.writeUInt16LE(33,14);record.writeUInt32LE(crc,16);record.writeUInt32LE(data.length,20);record.writeUInt32LE(data.length,24);record.writeUInt16LE(name.length,28);record.writeUInt32LE(offset,42);
    central.push(record,name);offset+=header.length+name.length+data.length;
  }
  const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
  const target=path.join(root,'artifacts/movieshub-source.zip');fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,Buffer.concat([...local,directory,end]));
  console.info(JSON.stringify({artifact:'artifacts/movieshub-source.zip',files:entries.length,bytes:fs.statSync(target).size}));
}
if(require.main===module) makeArchive();
module.exports={files,safeFile,makeArchive};
