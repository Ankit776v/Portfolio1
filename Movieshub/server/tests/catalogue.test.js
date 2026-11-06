const test = require('node:test');
const assert = require('node:assert/strict');
const { currentDay, shiftDay, makeQuery, familyTitle } = require('../catalogue');
test('India date changes at midnight, including year rollover', () => {
  assert.equal(currentDay(new Date('2026-10-06T18:29:59Z')), '2026-10-06');
  assert.equal(currentDay(new Date('2026-10-06T18:30:00Z')), '2026-10-07');
  assert.equal(currentDay(new Date('2026-12-31T18:30:00Z')), '2027-01-01');
  assert.equal(shiftDay('2028-02-28',1),'2028-02-29');
});
test('upcoming window starts tomorrow with theatrical regional release filters', () => {
  const { resource,params } = makeQuery('upcoming','2026-12-31','hi-IN',true);
  assert.equal(resource,'/discover/movie'); assert.equal(params.get('release_date.gte'),'2027-01-01');
  assert.equal(params.get('region'),'IN'); assert.equal(params.get('with_release_type'),'3|2'); assert.equal(params.get('language'),'hi-IN');
  assert.equal(makeQuery('now-playing','2026-10-06').resource,'/movie/now_playing');
  assert.equal(makeQuery('top-rated','2026-10-06').resource,'/movie/top_rated');
});
test('family filter excludes adult and unknown genres', () => {
  assert.equal(familyTitle({ adult:true,genre_ids:[16] }),false);
  assert.equal(familyTitle({ genre_ids:[18] }),false);
  assert.equal(familyTitle({ genre_ids:[10751] }),true);
});
test('catalogue refresh stores records, coalesces requests and reports stale failures', async () => {
  const install = require('../catalogue'); const records = new Map();
  const Record = {
    findOne({ key }) { return { lean: async () => records.get(key) }; },
    async findOneAndUpdate({ key },record) { records.set(key,record); },
  };
  const oldFetch=global.fetch, oldKey=process.env.TMDB_API_KEY; process.env.TMDB_API_KEY='test-only'; let calls=0;
  global.fetch=async () => { calls++; await new Promise(r => setTimeout(r,10)); return { ok:true,json:async () => ({ results:[{id:1,title:'Family',genre_ids:[16],release_date:shiftDay(currentDay(),1)},{id:2,title:'Released',genre_ids:[18],release_date:currentDay()}] }) }; };
  try {
    const service=install({ get() {} },{ mongoose:{ model:()=>Record,Schema:class { static Types = { Mixed:Object }; } },requireAuth() {},fetchRemote:(...args)=>global.fetch(...args) });
    const [a,b]=await Promise.all([service.load('upcoming','en-US',false),service.load('upcoming','en-US',false)]);
    assert.equal(calls,1); assert.deepEqual(a.results.map(i=>i.id),[1]); assert.deepEqual(a,b);
    await service.load('upcoming','en-US',false); assert.equal(calls,1);
    records.get(a.key).updatedAt = new Date(Date.now()-3600001);
    global.fetch=async () => { throw new Error('offline'); };
    assert.equal((await service.load('upcoming','en-US',false)).stale,true);
    await assert.rejects(service.load('popular','en-US',false),{ status:503 });
  } finally { global.fetch=oldFetch; if (oldKey===undefined) delete process.env.TMDB_API_KEY; else process.env.TMDB_API_KEY=oldKey; }
});
test('series queries use TV endpoints and future premiere dates', () => {
  assert.equal(makeQuery('series-top-rated','2026-10-06').resource,'/tv/top_rated');
  assert.equal(makeQuery('series-popular','2026-10-06').resource,'/tv/popular');
  const {resource,params}=makeQuery('series-upcoming','2026-12-31','hi-IN');
  assert.equal(resource,'/discover/tv');
  assert.equal(params.get('first_air_date.gte'),'2027-01-01');
  assert.equal(params.get('first_air_date.lte'),shiftDay('2026-12-31',180));
  assert.equal(params.get('include_null_first_air_dates'),'false');
  assert.equal(params.get('language'),'hi-IN');
  assert.equal(params.has('with_release_type'),false);
  assert.equal(params.has('region'),false);
});
test('upcoming series exclude existing premieres, unknown dates and movies', async () => {
  const records=new Map(), oldKey=process.env.TMDB_API_KEY;
  process.env.TMDB_API_KEY='test-only';
  const Record={ findOne:({key})=>({lean:async()=>records.get(key)}),findOneAndUpdate:async({key},record)=>records.set(key,record) };
  try {
    const service=require('../catalogue')({get(){}},{mongoose:{model:()=>Record,Schema:class {static Types={Mixed:Object};}},requireAuth(){},fetchRemote:async url=>{
      assert.equal(url.pathname,'/3/discover/tv');
      return {ok:true,json:async()=>({results:[
        {id:1,name:'New show',first_air_date:shiftDay(currentDay(),1)},
        {id:2,name:'Existing show',first_air_date:currentDay()},
        {id:3,name:'Unknown date',first_air_date:''},
        {id:4,title:'Movie',release_date:shiftDay(currentDay(),1)},
        {id:5,name:'Far future',first_air_date:shiftDay(currentDay(),181)},
      ]})};
    }});
    const record=await service.load('series-upcoming','en-US',false);
    assert.deepEqual(record.results.map(i=>i.id),[1]);
    assert.equal(records.size,1);
  } finally { if(oldKey===undefined) delete process.env.TMDB_API_KEY; else process.env.TMDB_API_KEY=oldKey; }
});
test('30-title pagination combines provider pages without gaps and caches separate display pages', async () => {
  const records=new Map(), oldKey=process.env.TMDB_API_KEY;
  process.env.TMDB_API_KEY='test-only';
  const calls=[];
  const Record={ findOne:({key})=>({lean:async()=>records.get(key)}),findOneAndUpdate:async({key},record)=>records.set(key,record) };
  try {
    const service=require('../catalogue')({get(){}},{mongoose:{model:()=>Record,Schema:class {static Types={Mixed:Object};}},requireAuth(){},fetchRemote:async url=>{
      const page=Number(url.searchParams.get('page'));calls.push(page);
      return {ok:true,json:async()=>({page,total_pages:600,total_results:12000,results:Array.from({length:20},(_,i)=>({id:(page-1)*20+i+1,name:'Show',popularity:10000-((page-1)*20+i)}))})};
    }});
    const first=await service.load('series-popular','en-US',false,1);
    const second=await service.load('series-popular','en-US',false,2);
    assert.equal(first.page,1);assert.equal(second.page,2);
    assert.equal(second.results[0].id,31);assert.equal(second.totalPages,334);
    assert.equal(second.totalResults,10000);assert.notEqual(first.key,second.key);
    await service.load('series-popular','en-US',false,2);
    assert.equal(first.results.length,30); assert.equal(second.results.length,30);
    assert.deepEqual([...first.results,...second.results].map(i=>i.id),Array.from({length:60},(_,i)=>i+1));
    assert.deepEqual(calls,[1,2,2,3]);
    const last=await service.load('series-popular','en-US',false,334);
    assert.equal(last.results.length,10);assert.equal(last.results[0].id,9991);
    assert.equal(makeQuery('top-rated',currentDay(),'en-US',false,3).params.get('page'),'3');
  } finally {if(oldKey===undefined)delete process.env.TMDB_API_KEY;else process.env.TMDB_API_KEY=oldKey;}
});
