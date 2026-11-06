const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const cookieParser = require('cookie-parser');
const { installSecurity, errorHandler, rateLimit, setSession, passwordIsValid } = require('../security');
const { pagination, reviewInput } = require('../reviews');

test('review validation rejects coercion, unbounded pagination and unsupported sorts', () => {
  assert.equal(passwordIsValid('é'.repeat(40)),false);
  assert.equal(passwordIsValid('a'.repeat(72)),true);
  assert.equal(passwordIsValid('a'.repeat(73)),false);
  for (const query of [{page:0},{page:'1.5'},{limit:51},{sort:'__proto__'},{sort:'constructor'}]) assert.throws(() => pagination(query), { status:400 });
  assert.deepEqual(pagination({page:'2',limit:'5',sort:'highest'}),{page:2,limit:5,sort:'highest'});
  for (const body of [{rating:'5',text:'x'.repeat(150)},{rating:0,text:'x'.repeat(150)},{rating:5,text:{}},{rating:5,text:'short'},{rating:5,text:'x'.repeat(1501)}]) assert.throws(() => reviewInput(body),{status:400});
});

test('cookie flags, CSRF checks, JSON errors, rate limits and security headers', async () => {
  const app=express(); app.use(express.json({limit:'1kb'})); app.use(cookieParser());
  installSecurity(app,{clientOrigin:'http://localhost:5173',logger:{info(){}}});
  app.post('/api/check',(req,res)=>res.json({ok:true}));
  app.get('/cookie',(req,res)=>{setSession(res,'test-token');res.end();});
  app.get('/limited',rateLimit({max:2}),(req,res)=>res.json({ok:true}));
  app.use(errorHandler);
  const server=app.listen(0,'127.0.0.1'); await new Promise(r=>server.once('listening',r));
  const base='http://127.0.0.1:'+server.address().port;
  try {
    const call=(headers={},body='{}')=>fetch(base+'/api/check',{method:'POST',headers:{'Content-Type':'application/json',...headers},body});
    assert.equal((await call({Origin:'https://evil.example'})).status,403);
    assert.equal((await call({Cookie:'movieshub_session=test'})).status,403);
    assert.equal((await call({Cookie:'movieshub_session=test',Origin:'http://localhost:5173'})).status,200);
    assert.equal((await call({'Sec-Fetch-Site':'cross-site'})).status,403);
    assert.equal((await call({},'[]')).status,400);
    assert.equal((await call({},'{')).status,400);
    assert.equal((await call({},JSON.stringify({data:'x'.repeat(2000)}))).status,413);
    assert.equal((await call({'Content-Type':'text/plain'})).status,415);
    const cookie=await fetch(base+'/cookie');
    assert.match(cookie.headers.get('set-cookie'),/HttpOnly/); assert.match(cookie.headers.get('set-cookie'),/SameSite=Lax/);
    const previousMode=process.env.NODE_ENV;
    try {
      process.env.NODE_ENV='production';
      const secureCookie=await fetch(base+'/cookie');
      assert.match(secureCookie.headers.get('set-cookie'),/; Secure/);
      assert.equal(secureCookie.headers.get('strict-transport-security'),'max-age=31536000');
    } finally { if(previousMode===undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV=previousMode; }
    assert.equal(cookie.headers.get('x-content-type-options'),'nosniff'); assert.equal(cookie.headers.get('x-powered-by'),null);
    await fetch(base+'/limited'); await fetch(base+'/limited'); const blocked=await fetch(base+'/limited');
    assert.equal(blocked.status,429); assert.ok(Number(blocked.headers.get('retry-after'))>0);
  } finally { await new Promise(r=>server.close(r)); }
});
