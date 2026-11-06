// Run against a dedicated demo database: DB_PATH=./demo.sqlite node scripts/seed-demo.js
const {DatabaseSync}=require('node:sqlite');
const crypto=require('node:crypto');
const path=require('node:path');
const db=new DatabaseSync(process.env.DB_PATH||path.join(__dirname,'../sprintboard.sqlite'));
const email=process.env.DEMO_EMAIL||'demo@sprintboard.example';
const password=process.env.DEMO_PASSWORD;
if(!password||password.length<12)throw Error('Set DEMO_PASSWORD to a unique 12+ character password. Never seed production.');
if(process.env.NODE_ENV==='production')throw Error('Demo seeding disabled in production');
const salt=crypto.randomBytes(16).toString('hex');const hash=salt+':'+crypto.scryptSync(password,salt,64).toString('hex');
const get=(s,...a)=>db.prepare(s).get(...a);const run=(s,...a)=>db.prepare(s).run(...a);
db.exec('BEGIN');try{
let user=get('SELECT id FROM users WHERE email=?',email);let uid=user?.id;if(!uid)uid=Number(run('INSERT INTO users(name,email,password) VALUES(?,?,?)','SprintBoard Demo',email,hash).lastInsertRowid);
const existing=get('SELECT id FROM projects WHERE owner_id=? AND name=?',uid,'Website Launch Sprint');
if(!existing){const pid=Number(run('INSERT INTO projects(name,description,color,owner_id) VALUES(?,?,?,?)','Website Launch Sprint','Sample workspace showcasing real task workflows.','#6366f1',uid).lastInsertRowid);run('INSERT INTO members(project_id,user_id,role) VALUES(?,?,?)',pid,uid,'owner');
for(const [title,status,priority,offset] of [['Plan launch milestones','done','high',-2],['Build landing page','progress','urgent',3],['Review accessibility','review','high',5],['Publish release notes','todo','medium',8],['QA mobile experience','todo','high',6]]){let due=new Date(Date.now()+offset*86400000).toISOString().slice(0,10);run('INSERT INTO tasks(project_id,title,description,status,priority,assignee_id,due_date,created_by) VALUES(?,?,?,?,?,?,?,?)',pid,title,'Sample task for recruiter walkthrough',status,priority,uid,due,uid)}run('INSERT INTO activity(project_id,user_id,message) VALUES(?,?,?)',pid,uid,'created the demo workspace')}
db.exec('COMMIT');console.log('Demo workspace ready for '+email)}catch(e){db.exec('ROLLBACK');throw e}
