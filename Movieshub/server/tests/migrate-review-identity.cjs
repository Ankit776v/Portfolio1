const fs=require('node:fs');
const path=require('node:path');
require('dotenv').config({path:path.join(__dirname,'..','.env'),quiet:true});
const mongoose=require('mongoose');
(async()=>{
 const {getReviewMovieId}=await import('../../client/src/review-identity.js');
 const text=fs.readFileSync(path.join(__dirname,'../../client/src/components/mlist.jsx'),'utf8');
 const {default:catalogue}=await import('data:text/javascript;base64,'+Buffer.from(text).toString('base64'));
 await mongoose.connect(process.env.MONGODB_URI);
 try {
  const collection=mongoose.connection.collection('reviews');
  const reviews=await collection.find({movieId:/^(tv|multi):/}).toArray();
  let migrated=0,unresolved=0;
  for(const review of reviews) {
   if(review.movieId.startsWith('tv:entry:'))continue;
   const matches=catalogue.filter(entry=>entry.title===review.movieTitle && getReviewMovieId(entry).startsWith('tv:entry:'));
   if(matches.length!==1){unresolved++;continue;}
   const result=await collection.updateOne({_id:review._id,movieId:review.movieId},{$set:{movieId:getReviewMovieId(matches[0]),legacyMovieId:review.movieId}});
   migrated+=result.modifiedCount;
  }
  console.log(`Migrated ${migrated} existing reviews using their saved catalogue titles. Unresolved reviews left unchanged: ${unresolved}.`);
 }finally{await mongoose.disconnect();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
