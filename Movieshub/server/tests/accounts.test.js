const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('node:crypto');
test('account persistence, PIN isolation, sessions, password rotation, export and deletion', { skip: !process.env.RUN_MONGO_TESTS }, async () => {
  const dbName = 'movieshub_test_' + crypto.randomBytes(8).toString('hex');
  await mongoose.connect('mongodb://127.0.0.1:27017/' + dbName,{ serverSelectionTimeoutMS:5000 });
  let server;
  try {
    const User=mongoose.model('User',new mongoose.Schema({ name:String,email:{type:String,unique:true},passwordHash:String,resetPasswordVersion:{type:Number,default:0},account:mongoose.Schema.Types.Mixed },{ timestamps:true }));
    const Review=mongoose.model('Review',new mongoose.Schema({ user:mongoose.Schema.Types.ObjectId,text:String }));
    const app=express(); app.use(express.json());
    const secret='integration-test-only-secret';
    const service=require('../accounts')(app,{ User,Review,mongoose,jwtSecret:secret });
    app.get('/protected',service.requireAuth,(req,res)=>res.json({ok:true}));
    app.use((e,req,res,next)=>res.status(500).json({message:e.message}));
    server=app.listen(0,'127.0.0.1'); await new Promise(r=>server.once('listening',r));
    const base='http://127.0.0.1:'+server.address().port;
    let user=await User.create({name:'Tester',email:'test@example.test',passwordHash:await bcrypt.hash('test-password-123',4)});
    let token=await service.createToken(user);
    async function request(path,method='GET',body,auth=token) { const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+auth},...(body===undefined?{}:{body:JSON.stringify(body)})}); return {status:response.status,data:await response.json()}; }
    let result=await request('/api/account'); assert.equal(result.status,200); assert.equal(result.data.user.profiles.length,1);
    const legacyUser=await User.create({name:'Legacy',email:'legacy@example.test',resetPasswordVersion:0});
    const legacyUserToken=jwt.sign({sub:legacyUser.id},secret,{expiresIn:'7d'});
    const firstLegacy=await request('/api/account','GET',undefined,legacyUserToken);
    const secondLegacy=await request('/api/account','GET',undefined,legacyUserToken);
    assert.equal(firstLegacy.data.user.profiles[0].id,secondLegacy.data.user.profiles[0].id);
    await User.deleteOne({_id:legacyUser._id}); await service.Session.deleteMany({userId:legacyUser._id});
    const main=result.data.user.profiles[0].id;
    const item={id:42,type:'movie',title:'Test movie',poster:'/poster.jpg'};
    await request(`/api/account/profiles/${main}/watchlist`,'POST',{item});
    await request(`/api/account/profiles/${main}/history`,'POST',{item});
    await request(`/api/account/profiles/${main}/ratings`,'POST',{key:'movie:42',rating:1});
    result=await request('/api/account'); assert.equal(result.data.user.profiles[0].watchlist.length,1); assert.equal(result.data.user.profiles[0].history.length,1); assert.equal(result.data.user.profiles[0].ratings['movie:42'],1);
    await request('/api/account/profiles','POST',{name:'Kids',kids:true});
    result=await request('/api/account'); assert.equal(result.data.user.profiles[1].watchlist.length,0);
    await request(`/api/account/profiles/${main}`,'PATCH',{pin:'1234',currentPassword:'test-password-123'});
    result=await request('/api/account'); assert.equal(result.data.user.profiles[0].hasPin,true); assert.equal(result.data.user.profiles[0].pin,undefined); assert.equal(result.data.user.profiles[0].watchlist.length,0);
    assert.equal((await request(`/api/account/profiles/${main}/watchlist`,'POST',{item})).status,403);
    assert.equal((await request(`/api/account/profiles/${main}/unlock`,'POST',{pin:'0000'})).status,403);
    assert.equal((await request(`/api/account/profiles/${main}/unlock`,'POST',{pin:'1234'})).status,200);
    assert.equal((await request('/api/account')).data.user.profiles[0].watchlist.length,1);
    assert.equal((await request('/api/account/export')).data.account.profiles[0].history.length,1);
    await request('/api/account/preferences','PATCH',{language:'hi-IN',subtitles:false});
    await request('/api/account/membership','PATCH',{plan:'Premium',membership:'cancelled'});
    result=await request('/api/account'); assert.equal(result.data.user.preferences.language,'hi-IN'); assert.equal(result.data.user.plan,'Premium');
    const other=await service.createToken(await User.findById(user.id));
    await request('/api/account/sessions','DELETE',{allOthers:true});
    assert.equal((await request('/protected','GET',undefined,other)).status,401);
    assert.equal((await request('/protected')).status,200);
    // Legacy JWT revocation stays revoked; middleware must not recreate it.
    const legacy=jwt.sign({sub:user.id},secret,{expiresIn:'7d'});
    assert.equal((await request('/protected','GET',undefined,legacy)).status,200);
    await request('/api/auth/logout','POST',{},legacy);
    assert.equal((await request('/protected','GET',undefined,legacy)).status,401);
    const before=token;
    result=await request('/api/account','PATCH',{newPassword:'new-password-123',currentPassword:'test-password-123'});
    assert.equal(result.status,200); token=result.data.token;
    assert.equal((await request('/protected','GET',undefined,before)).status,401); assert.equal((await request('/protected')).status,200);
    assert.equal((await request('/api/account','DELETE',{password:'wrong'})).status,403);
    await Review.create({user:user._id,text:'Test review'});
    assert.equal((await request('/api/account','DELETE',{password:'new-password-123'})).status,200);
    assert.equal(await User.countDocuments(),0); assert.equal(await Review.countDocuments(),0); assert.equal(await service.Session.countDocuments(),0);
    assert.equal((await request('/protected')).status,401);
  } finally {
    if (server) await new Promise(r=>server.close(r));
    // Only this randomly named, dedicated test database is removed.
    assert.match(mongoose.connection.name,/^movieshub_test_[a-f0-9]{16}$/);
    await mongoose.connection.dropDatabase(); await mongoose.disconnect();
  }
});
