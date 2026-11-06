const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
test('Power Rangers reviews are isolated by catalogue season while TMDB IDs remain shared',async()=>{
 const {getReviewMovieId}=await import('../../client/src/review-identity.js');
 const source=fs.readFileSync(path.join(__dirname,'../../client/src/components/mlist.jsx'),'utf8');
 const {default:list}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const rpm=list.find(i=>i.title==='Power Rangers RPM (2009)');
 const samurai=list.find(i=>i.title==='Power Rangers Samurai (2011)');
 assert.ok(rpm);assert.ok(samurai);assert.equal(rpm.id,samurai.id);
 assert.notEqual(getReviewMovieId(rpm),getReviewMovieId(samurai));
 assert.match(getReviewMovieId(rpm),/seasons:17$/);
 assert.equal(getReviewMovieId({...rpm,id:999}),getReviewMovieId(rpm));
 assert.notEqual(getReviewMovieId({...rpm,seasons:[{seasonid:18}]}),getReviewMovieId(rpm));
 assert.equal(getReviewMovieId({id:42,title:'Movie',categories:'movie'}),'movie:42');
 assert.equal(getReviewMovieId({id:2328,title:'',categories:'tv',live:true}),'tv:2328');
});
