const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { parseFilters } = require('../catalogue-filters');
const { makeQuery, currentDay } = require('../catalogue');

test('movie and TV discovery filters use original language, type-specific genres/year and numeric ratings', () => {
  const filters={originalLanguage:'hi',genre:'18',year:'2025',minRating:'7',sort:'rating'};
  const movie=makeQuery('discover-movies','2026-10-24','en-US',false,3,filters);
  assert.equal(movie.resource,'/discover/movie');
  assert.equal(movie.params.get('with_original_language'),'hi');
  assert.equal(movie.params.get('language'),'en-US');
  assert.equal(movie.params.get('with_genres'),'18');
  assert.equal(movie.params.get('primary_release_year'),'2025');
  assert.equal(movie.params.get('vote_average.gte'),'7');
  assert.equal(movie.params.get('sort_by'),'vote_average.desc');
  assert.equal(movie.params.get('page'),'3');
  const tv=makeQuery('series-discover','2026-10-24','en-US',false,1,{...filters,genre:'10765',sort:'newest'});
  assert.equal(tv.resource,'/discover/tv');
  assert.equal(tv.params.get('first_air_date_year'),'2025');
  assert.equal(tv.params.get('sort_by'),'first_air_date.desc');
  assert.equal(tv.params.has('primary_release_year'),false);
  assert.equal(tv.params.has('region'),false);
  assert.equal(tv.params.get('include_adult'),'false');
});
test('section constraints and family filtering survive discovery filters', () => {
  const upcoming=makeQuery('series-upcoming','2026-10-24','en-US',true,1,{originalLanguage:'ja'});
  assert.equal(upcoming.params.get('first_air_date.gte'),'2026-10-25');
  assert.equal(upcoming.params.get('with_genres'),'10751|10762|16');
  const movie=makeQuery('upcoming','2026-10-24','en-US',false,1,{genre:'18'});
  assert.equal(movie.params.get('release_date.gte'),'2026-10-25');
  assert.equal(movie.params.get('with_release_type'),'3|2');
  const theatres=makeQuery('now-playing','2026-10-24','en-US',false,1,{originalLanguage:'hi'});
  assert.equal(theatres.params.get('release_date.lte'),'2026-10-24');
  assert.equal(theatres.params.get('release_date.gte'),'2026-08-25');
  assert.equal(makeQuery('popular','2026-10-24').resource,'/movie/popular');
});
test('invalid filter values and wrong media genres fail before provider access', () => {
  for (const query of [{originalLanguage:{$ne:''}},{originalLanguage:'Hindi'},{genre:'10765'},{year:'tomorrow'},{minRating:'11'},{minRating:'-1'},{sort:'constructor'},{sort:['rating','popular']}]) assert.throws(()=>parseFilters(query,'movie'),{status:400});
  assert.throws(()=>parseFilters({genre:'878'},'tv'),{status:400});
});
test('filtered pages preserve 30-item pagination and isolate caches by filter combination', async () => {
  const records=new Map(), calls=[], previousKey=process.env.TMDB_API_KEY;
  process.env.TMDB_API_KEY='test-fixture';
  const Record={findOne:({key})=>({lean:async()=>records.get(key)}),findOneAndUpdate:async({key},record)=>records.set(key,record)};
  try {
    const service=require('../catalogue')({get(){}},{mongoose:{model:()=>Record,Schema:class {static Types={Mixed:Object};}},requireAuth(){},fetchRemote:async url=>{
      calls.push(url);const page=Number(url.searchParams.get('page'));
      return {ok:true,json:async()=>({total_pages:5,total_results:100,results:Array.from({length:20},(_,i)=>({id:(page-1)*20+i+1,original_language:url.searchParams.get('with_original_language')}))})};
    }});
    const first=await service.load('series-discover','en-US',false,1,{originalLanguage:'hi'});
    const second=await service.load('series-discover','en-US',false,2,{originalLanguage:'hi'});
    const other=await service.load('series-discover','en-US',false,1,{originalLanguage:'ja'});
    assert.equal(first.results.length,30);assert.equal(second.results[0].id,31);
    assert.equal(other.results[0].original_language,'ja');assert.notEqual(first.key,other.key);
    const count=calls.length;await service.load('series-discover','en-US',false,1,{originalLanguage:'hi'});assert.equal(calls.length,count);
    assert.equal(calls[0].pathname,'/3/discover/tv');assert.equal(first.day,currentDay());
  } finally {if(previousKey===undefined) delete process.env.TMDB_API_KEY;else process.env.TMDB_API_KEY=previousKey;}
});
test('metadata proxy accepts non-curated seasons, specials and individual episode resources', async () => {
  const previousKey=process.env.TMDB_API_KEY;process.env.TMDB_API_KEY='test-fixture';
  const calls=[],app=express();
  require('../tmdb-proxy')(app,{fetchRemote:async url=>{calls.push(url);return {ok:true,json:async()=>({name:'Remote episode',episode_number:1})};}});
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  try {
    for(const resource of ['tv/999999','tv/999999/season/0','tv/999999/season/1','tv/999999/season/1/episode/1']) {
      const response=await fetch(base+'/api/tmdb/'+resource+'?language=hi-IN');assert.equal(response.status,200);
      assert.equal((await response.json()).name,'Remote episode');
    }
    assert.equal(calls[3].pathname,'/3/tv/999999/season/1/episode/1');
    assert.equal(calls[3].searchParams.get('language'),'hi-IN');
    assert.equal((await fetch(base+'/api/tmdb/account')).status,404);
  } finally {await new Promise(resolve=>server.close(resolve));if(previousKey===undefined)delete process.env.TMDB_API_KEY;else process.env.TMDB_API_KEY=previousKey;}
});
