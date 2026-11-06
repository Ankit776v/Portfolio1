const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const { createApp } = require('../app');

test('two-account authentication, profile isolation, reviews, reports, catalogue and revocation', { skip: !process.env.RUN_MONGO_TESTS, timeout:60000 }, async () => {
  const dbName='movieshub_test_'+crypto.randomBytes(8).toString('hex');
  const database=new mongoose.Mongoose();
  await database.connect('mongodb://127.0.0.1:27017/'+dbName,{serverSelectionTimeoutMS:5000});
  let server;
  const previousKey=process.env.TMDB_API_KEY; process.env.TMDB_API_KEY='test-only-provider-key';
  try {
    const secret=crypto.randomBytes(32).toString('hex');
    const {app,User,Review,Report}=createApp({
      database,
      env:{JWT_SECRET:secret,CLIENT_ORIGIN:'http://localhost:5173',NODE_ENV:'production'},
      logger:{info(){}},
      fetchRemote:async url => ({ok:true,json:async()=>({
        page:Number(url.searchParams.get('page')),total_pages:5,total_results:100,
        results:Array.from({length:20},(_,i)=>({id:(Number(url.searchParams.get('page'))-1)*20+i+1,title:'Test title',genre_ids:[16]})),
      })}),
    });
    await Promise.all(Object.values(database.models).map(model=>model.init()));
    server=app.listen(0,'127.0.0.1'); await new Promise(r=>server.once('listening',r));
    const base='http://127.0.0.1:'+server.address().port;
    async function request(path,method='GET',body,cookie='',headers={}) {
      const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',Origin:'http://localhost:5173',...(cookie?{Cookie:cookie}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
      const text=await response.text(); return {status:response.status,data:text?JSON.parse(text):null,cookie:response.headers.get('set-cookie')?.split(';')[0],headers:response.headers};
    }
    assert.equal((await request('/api/health')).status,200);
    assert.equal((await request('/api/unknown')).status,404);
    for (const path of ['/api/account','/api/account/reviews','/api/account/sessions','/api/account/export']) assert.equal((await request(path)).status,401);
    assert.equal((await request('/api/auth/register','POST',{name:{},email:[],password:'long-password-123'})).status,400);
    assert.equal((await request('/api/auth/login','POST',{email:{$ne:null},password:'long-password-123'})).status,400);
    assert.equal((await request('/api/auth/register','POST',{name:'Date',email:'date@example.test',password:'long-password-123',dateOfBirth:'2026-02-30'})).status,400);
    assert.equal((await request('/api/auth/register','POST',{name:'Long',email:'long@example.test',password:'é'.repeat(40)})).status,400);
    const a=await request('/api/auth/register','POST',{name:'Alice',email:'alice@example.test',password:'alice-password-123',dateOfBirth:''});
    const b=await request('/api/auth/register','POST',{name:'Bob',email:'bob@example.test',password:'bob-password-123'});
    assert.equal(a.status,201); assert.equal(b.status,201); assert.ok(a.cookie); assert.equal(a.data.token,undefined);
    assert.equal((await request('/api/auth/register','POST',{name:'Duplicate',email:' ALICE@example.test ',password:'long-password-123'})).status,409);
    const simultaneous=await Promise.all([1,2].map(()=>request('/api/auth/register','POST',{name:'Race',email:'race@example.test',password:'long-password-123'})));
    assert.deepEqual(simultaneous.map(r=>r.status).sort(),[201,409]);
    const profile=a.data.user.profiles[0].id, bobProfile=b.data.user.profiles[0].id;
    const profilePath='/api/account/profiles/'+profile;
    const item={id:42,type:'movie',title:'Example',poster:'/poster.jpg'};
    for (const action of ['watchlist','history','ratings','unlock']) {
      assert.equal((await request(profilePath+'/'+action,'POST',{item,key:'movie:42',rating:1,pin:'1234'},b.cookie)).status,404);
      assert.equal((await request(profilePath+'/'+action,'POST',{},'')).status,401);
    }
    assert.equal((await request(profilePath,'DELETE',{},b.cookie)).status,404);
    assert.equal((await request(profilePath,'PATCH',{name:'Stolen'},b.cookie)).status,404);
    assert.equal((await request(profilePath+'/watchlist','POST',{item:{id:{$gt:0},type:'movie',title:'bad'}},a.cookie)).status,400);
    assert.equal((await request('/api/account/preferences','PATCH',{autoplay:'yes'},a.cookie)).status,400);
    assert.equal((await request('/api/account','PATCH',{email:'bob@example.test',currentPassword:'alice-password-123'},a.cookie)).status,409);
    assert.equal((await request(profilePath+'/watchlist','POST',{item},a.cookie)).status,200);
    assert.equal((await request('/api/account','GET',undefined,b.cookie)).data.user.profiles[0].watchlist.length,0);
    assert.equal((await request(profilePath,'PATCH',{pin:'1234',currentPassword:'alice-password-123'},a.cookie)).status,200);
    assert.equal((await request(profilePath+'/watchlist','POST',{item},a.cookie)).status,403);
    assert.equal((await request(profilePath,'PATCH',{kids:false},a.cookie)).status,403);
    assert.equal((await request(profilePath+'/unlock','POST',{pin:'1234'},a.cookie)).status,200);
    const exported=await request('/api/account/export','GET',undefined,b.cookie);
    assert.equal(exported.data.account.id,b.data.user.id); assert.equal(exported.data.reviews.length,0);
    const root='/api/movies/movie%3A42/reviews', text='A thoughtful review of the performances, direction, and pacing. '.repeat(4);
    assert.equal((await request(root,'POST',{rating:5,text})).status,401);
    assert.equal((await request(root,'POST',{rating:'5',text},a.cookie)).status,400);
    const first=await request(root,'POST',{rating:5,text,movieTitle:'Example'},a.cookie);
    const second=await request(root,'POST',{rating:1,text,movieTitle:'Example'},b.cookie);
    assert.equal(first.status,201); assert.equal(second.status,201);
    const id=first.data.review.id;
    assert.equal((await request(root+'/'+id,'PUT',{rating:2,text},b.cookie)).status,404);
    assert.equal((await request(root+'/'+id,'DELETE',{},b.cookie)).status,404);
    assert.equal((await request('/api/movies/movie%3A99/reviews/'+id,'DELETE',{},a.cookie)).status,404);
    let feed=await request(root+'?limit=1&sort=highest');
    assert.equal(feed.data.total,2); assert.equal(feed.data.averageRating,3); assert.equal(feed.data.totalPages,2); assert.equal(feed.data.reviews[0].rating,5);
    const next=await request(root+'?limit=1&page=2&sort=highest'); assert.equal(next.data.reviews[0].rating,1);
    assert.equal((await request(root+'?sort=constructor')).status,400);
    assert.equal((await request(root+'/'+id+'/report','POST',{reason:'spam'},b.cookie)).status,202);
    assert.equal((await request(root+'/'+id+'/report','POST',{reason:'spam'},b.cookie)).status,202);
    assert.equal(await Report.countDocuments(),1);
    assert.equal((await request(root+'/'+id+'/report','POST',{reason:'spam'},a.cookie)).status,400);
    const history=await request('/api/account/reviews','GET',undefined,b.cookie);
    assert.equal(history.data.total,1); assert.equal(history.data.reviews[0].user.id,b.data.user.id);
    assert.equal((await request(root+'/'+id,'PUT',{rating:3,text},a.cookie)).status,200);
    assert.equal((await request(root)).data.averageRating,2);
    assert.equal((await request(root+'/'+id,'DELETE',{},a.cookie)).status,204); assert.equal(await Report.countDocuments(),0);
    const catalogue=await request('/api/catalogue/popular?page=2','GET',undefined,a.cookie);
    assert.equal(catalogue.status,200); assert.equal(catalogue.data.pageSize,30); assert.equal(catalogue.data.results[0].id,31);
    for (const kind of ['discover-movies','series-discover']) {
      const discovered=await request(`/api/catalogue/${kind}?originalLanguage=hi&genre=18&year=2025&minRating=7&sort=rating`);
      assert.equal(discovered.status,200); assert.equal(discovered.data.filters.originalLanguage,'hi');
      assert.equal(discovered.data.pageSize,30); assert.equal(discovered.data.mediaType,kind==='series-discover'?'tv':'movie');
      assert.equal((await request(`/api/catalogue/${kind}?originalLanguage=not-a-language`)).status,400);
      assert.equal((await request(`/api/catalogue/${kind}?sort=constructor`)).status,400);
    }
    assert.equal((await request('/api/catalogue/popular?profile='+profile,'GET',undefined,b.cookie)).status,404);
    assert.equal((await request('/api/catalogue/popular?profile='+bobProfile,'GET',undefined,a.cookie)).status,404);
    assert.equal((await request('/api/catalogue/popular?page=335')).status,400);
    assert.equal((await request('/api/tmdb/account')).status,404);
    assert.equal((await request('/api/tmdb/movie/42')).status,200);
    const device=(await request('/api/auth/login','POST',{email:'alice@example.test',password:'alice-password-123'})).cookie;
    assert.equal((await request('/api/account/sessions','DELETE',{allOthers:true},a.cookie)).status,200);
    assert.equal((await request('/api/account','GET',undefined,device)).status,401);
    const rotated=await request('/api/account','PATCH',{newPassword:'alice-updated-123',currentPassword:'alice-password-123'},a.cookie);
    assert.equal(rotated.status,200); assert.ok(rotated.cookie); assert.equal(rotated.data.token,undefined);
    assert.equal((await request('/api/account','GET',undefined,rotated.cookie)).status,200);
    assert.equal((await request('/api/account','GET',undefined,a.cookie)).status,401);
    assert.equal((await request('/api/auth/logout','POST',{},b.cookie)).status,200);
    assert.equal((await request('/api/account','GET',undefined,b.cookie)).status,401);
    const bobLogin=await request('/api/auth/login','POST',{email:'bob@example.test',password:'bob-password-123'});
    const reset=jwt.sign({sub:b.data.user.id,type:'password-reset',version:0},secret+':password-reset',{expiresIn:'15m'});
    assert.equal((await request('/api/auth/reset-password','POST',{token:reset,password:'bob-updated-123'})).status,200);
    assert.equal((await request('/api/auth/reset-password','POST',{token:reset,password:'bob-updated-123'})).status,400);
    assert.equal((await request('/api/account','GET',undefined,bobLogin.cookie)).status,401);
    const bobUpdated=await request('/api/auth/login','POST',{email:'bob@example.test',password:'bob-updated-123'});
    assert.equal((await request('/api/account','DELETE',{password:'wrong-password'},bobUpdated.cookie)).status,403);
    assert.equal((await request('/api/account','DELETE',{password:'bob-updated-123'},bobUpdated.cookie)).status,200);
    assert.equal((await request('/api/account','GET',undefined,bobUpdated.cookie)).status,401);
    assert.equal(await User.countDocuments(),2); assert.equal(await Review.countDocuments(),0);
  } finally {
    if (server) await new Promise(r=>server.close(r));
    assert.match(database.connection.name,/^movieshub_test_[a-f0-9]{16}$/);
    await database.connection.dropDatabase(); await database.disconnect();
    if (previousKey===undefined) delete process.env.TMDB_API_KEY; else process.env.TMDB_API_KEY=previousKey;
  }
});
