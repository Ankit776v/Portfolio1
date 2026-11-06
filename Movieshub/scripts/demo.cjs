// Reproducible screenshots + short WebM walkthrough from a disposable local app.
// Uses built-in Chrome DevTools and a canvas MediaRecorder, no production data.
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const mongoose=require('../server/node_modules/mongoose');
const {createApp}=require('../server/app');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const root=path.resolve(__dirname,'..');

async function main() {
  const chrome=process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>fs.existsSync(p));
  if(!chrome) throw new Error('Set CHROME_PATH to a Chrome/Chromium executable.');
  const database=new mongoose.Mongoose(), dbName='movieshub_test_'+crypto.randomBytes(8).toString('hex');
  await database.connect('mongodb://127.0.0.1:27017/'+dbName,{serverSelectionTimeoutMS:5000});
  let server,browser,socket;
  const browserProfile=fs.mkdtempSync(path.join(os.tmpdir(),'movieshub-demo-'));
  const output=path.join(root,'docs/screenshots');fs.mkdirSync(output,{recursive:true});
  process.env.TMDB_API_KEY='demo-fixture-only';
  try {
    const fixture={id:42,title:'The Last Frame',name:'The Last Frame',overview:'A young filmmaker returns to her hometown to finish a documentary, discovering that the stories we leave behind can change how we see our future. Demo metadata for the Movieshub walkthrough.',release_date:'2026-01-10',first_air_date:'2026-01-10',vote_average:8.2,popularity:100,genres:[{id:18,name:'Drama'}],runtime:112,poster_path:null,backdrop_path:null,credits:{cast:[],crew:[]}};
    const {app,User,Review,Report}=createApp({database,env:{JWT_SECRET:crypto.randomBytes(32).toString('hex'),CLIENT_ORIGIN:'http://127.0.0.1:5199',NODE_ENV:'production'},logger:{info(){}},fetchRemote:async url=>({ok:true,json:async()=>url.pathname.includes('/credits')?{cast:[],crew:[]}:url.pathname.includes('/videos')?{results:[]}:url.pathname.includes('/search/')?{results:[fixture]}:fixture})});
    await Promise.all([User.init(),Review.init(),Report.init()]);
    server=app.listen(5199,'127.0.0.1');await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
    const base='http://127.0.0.1:5199';
    const password=crypto.randomBytes(20).toString('hex');
    async function register(name,email) {
      const response=await fetch(base+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,email,password})});
      if(!response.ok) throw new Error('Demo account creation failed.');return (await response.json()).user;
    }
    const alice=await register('Avery Morgan','avery@movieshub.example'),bob=await register('Jordan Lee','jordan@movieshub.example');
    const comments=[
      'A beautifully paced story with memorable performances. The quiet moments are where it shines, and the final scene brings the themes together without overexplaining them. A thoughtful film that rewards your attention.',
      'The cinematography gives every scene a sense of place, and the lead performance feels wonderfully natural. A few scenes in the middle could be tighter, but the emotional payoff makes the journey worthwhile.',
      'What stayed with me was the way the film explores memory and belonging through small everyday details. The music supports the story gracefully, and I would happily revisit it to catch what I missed the first time.',
    ];
    await Review.insertMany(Array.from({length:14},(_,i)=>({movieId:'movie:42',movieTitle:'The Last Frame',user:i%2?bob.id:alice.id,rating:i%3?5:4,text:comments[i%3],createdAt:new Date(Date.now()-i*3600000),updatedAt:new Date(Date.now()-i*3600000)})));
    browser=spawn(chrome,['--headless=new','--remote-debugging-port=0','--remote-debugging-address=127.0.0.1',`--user-data-dir=${browserProfile}`,'--window-size=1440,1000','--no-first-run','--no-default-browser-check','about:blank'],{windowsHide:true,stdio:'ignore'});
    browser.on('error',error=>console.error(error.message));
    const portFile=path.join(browserProfile,'DevToolsActivePort');
    for(let i=0;i<100&&!fs.existsSync(portFile);i++) await delay(100);
    if(!fs.existsSync(portFile)) throw new Error('Chrome DevTools did not start.');
    const port=fs.readFileSync(portFile,'utf8').split('\n')[0];
    const targets=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
    await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
    let sequence=0;const waiting=new Map();
    socket.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.id&&waiting.has(message.id)){const {resolve,reject,timer}=waiting.get(message.id);clearTimeout(timer);waiting.delete(message.id);message.error?reject(new Error(message.error.message)):resolve(message.result);}});
    const cdp=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{waiting.delete(id);reject(new Error('Timed out: '+method));},20000);waiting.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
    const evaluate=async expression=>{const result=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.text);return result.result.value;};
    await cdp('Page.enable');
    await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    const frames=[];
    async function screenshot(name) {
      await delay(500);const result=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
      fs.writeFileSync(path.join(output,name+'.png'),Buffer.from(result.data,'base64'));
      const frame=await cdp('Page.captureScreenshot',{format:'jpeg',quality:80,captureBeyondViewport:false});frames.push(frame.data);
      console.info('Captured '+name);
    }
    async function navigate(route) {await cdp('Page.navigate',{url:base+route});await delay(1100);}
    await navigate('/title/movie/42');
    await evaluate("document.querySelector('.reviews-section').scrollIntoView({block:'start'})");
    await screenshot('reviews-desktop');
    await navigate('/login');
    await evaluate(`document.querySelector('[name=email]').value='avery@movieshub.example';document.querySelector('[name=password]').value=${JSON.stringify(password)};document.querySelector('form.data').requestSubmit()`);
    await delay(1000);
    if(!await evaluate("document.cookie.indexOf('movieshub_session') === -1")) throw new Error('Session cookie must not be script-readable.');
    await navigate('/account');
    await evaluate("[...document.querySelectorAll('.account-tabs button')].find(b=>b.textContent==='Reviews').click()");
    await screenshot('review-history');
    await evaluate("[...document.querySelectorAll('.account-tabs button')].find(b=>b.textContent==='Security & devices').click()");
    await screenshot('account-security');
    await navigate('/title/movie/42');
    await evaluate("document.querySelector('.reviews-section').scrollIntoView({block:'start'})");
    await screenshot('reviews-signed-in');
    await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await evaluate("document.querySelector('.reviews-section').scrollIntoView({block:'start'})");
    await screenshot('reviews-mobile');
    // Encode captured real browser frames as a short narrated-by-README walkthrough.
    await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    const video=await evaluate(`(async()=>{
      const frames=${JSON.stringify(frames.slice(0,4))};
      const canvas=document.createElement('canvas');canvas.width=1440;canvas.height=1000;
      const context=canvas.getContext('2d'),stream=canvas.captureStream(10),chunks=[];
      const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8',videoBitsPerSecond:1500000});
      const done=new Promise(resolve=>recorder.onstop=resolve);recorder.ondataavailable=event=>chunks.push(event.data);recorder.start();
      for(const frame of frames){const image=new Image();image.src='data:image/jpeg;base64,'+frame;await image.decode();context.drawImage(image,0,0);await new Promise(resolve=>setTimeout(resolve,2500));}
      recorder.stop();await done;stream.getTracks().forEach(track=>track.stop());
      const reader=new FileReader();const encoded=new Promise(resolve=>reader.onload=()=>resolve(reader.result.split(',')[1]));reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));return encoded;
    })()`);
    fs.writeFileSync(path.join(root,'docs/demo.webm'),Buffer.from(video,'base64'));
    console.info('Saved docs/demo.webm (10-second slideshow of actual browser captures; demo fixtures).');
  } finally {
    if(socket) socket.close();
    if(browser) browser.kill();
    if(server) await new Promise(resolve=>server.close(resolve));
    if(!/^movieshub_test_[a-f0-9]{16}$/.test(database.connection.name)) throw new Error('Refusing cleanup of a non-test database.');
    await database.connection.dropDatabase();await database.disconnect();
    // Leave the isolated browser profile in the OS temp directory; do not recursively delete user paths.
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
