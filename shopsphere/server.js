'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const PORT=Number(process.env.PORT||3001), HOST=process.env.HOST||'0.0.0.0';
const LOCAL_ORIGINS=new Set(process.env.NODE_ENV==='production'?[]:JSON.parse(process.env.PORTFOLIO_LOCAL_ORIGINS||'[]'));
const DATA=process.env.DATA_DIR||path.join(__dirname,'data');fs.mkdirSync(DATA,{recursive:true});
const db=new DatabaseSync(path.join(DATA,'shopsphere.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'customer',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY,name TEXT NOT NULL,category TEXT NOT NULL,description TEXT NOT NULL,price INTEGER NOT NULL,stock INTEGER NOT NULL,emoji TEXT NOT NULL,color TEXT NOT NULL,featured INTEGER NOT NULL DEFAULT 0,active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS carts(user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,product_id INTEGER NOT NULL REFERENCES products(id),quantity INTEGER NOT NULL,PRIMARY KEY(user_id,product_id));
CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),total INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'Placed',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS order_items(order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,product_id INTEGER NOT NULL,product_name TEXT NOT NULL,price INTEGER NOT NULL,quantity INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY,user_id INTEGER,kind TEXT NOT NULL,detail TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);`);
db.exec(`CREATE TABLE IF NOT EXISTS password_resets(token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL);`);
// Existing installations: add ownership without replacing or resetting inventory.
const columns=db.prepare('PRAGMA table_info(products)').all().map(x=>x.name);
if(!columns.includes('image_url'))db.exec('ALTER TABLE products ADD COLUMN image_url TEXT');
if(!columns.includes('seller_id'))db.exec('ALTER TABLE products ADD COLUMN seller_id INTEGER REFERENCES users(id)');
const sample=require('./productlist');
if(!db.prepare('SELECT count(*) n FROM products').get().n){const add=db.prepare('INSERT INTO products(name,category,description,price,stock,emoji,color,featured) VALUES(?,?,?,?,?,?,?,?)');for(const p of sample)add.run(...p)}
const hash=p=>{const salt=crypto.randomBytes(16).toString('hex');return salt+':'+crypto.scryptSync(p,salt,64).toString('hex')};
const verify=(p,s)=>{try{const [salt,h]=s.split(':');return crypto.timingSafeEqual(crypto.scryptSync(p,salt,64),Buffer.from(h,'hex'))}catch{return false}};
function ensureDemo(){for(const [name,email,pass,role] of [['Demo Shopper','demo@shopsphere.local','Demo12345!','customer'],['Demo Admin','admin@shopsphere.local','Admin12345!','admin']]){if(!db.prepare('SELECT id FROM users WHERE email=?').get(email))db.prepare('INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)').run(name,email,hash(pass),role)}}
if(process.env.ENABLE_DEMO==='true')ensureDemo();
const UPLOADS=path.join(DATA,'product-images');fs.mkdirSync(UPLOADS,{recursive:true});
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
function reply(res,status,data,extra={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...extra});res.end(JSON.stringify(data))}
function cookie(req){const v=(req.headers.cookie||'').match(/(?:^|;\s*)session=([^;]+)/);return v?decodeURIComponent(v[1]):null}
function user(req){const t=cookie(req);if(!t)return null;return db.prepare('SELECT u.id,u.name,u.email,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').get(crypto.createHash('sha256').update(t).digest('hex'),Date.now())||null}
function newSession(res,id){const t=crypto.randomBytes(32).toString('hex');db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(crypto.createHash('sha256').update(t).digest('hex'),id,Date.now()+7*86400000);res.setHeader('Set-Cookie',`session=${t}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${process.env.NODE_ENV==='production'?'; Secure':''}`)}
function parseBody(req,maxBytes=20000){return new Promise((resolve,reject)=>{
 let chunks=[],size=0,failed=false;
 req.on('data',chunk=>{
  if(failed)return;
  size+=chunk.length;
  if(size>maxBytes){failed=true;chunks=[];reject(Object.assign(new Error('Request too large'),{status:413}));return}
  chunks.push(chunk);
 });
 req.on('end',()=>{
  if(failed)return;
  try{const body=Buffer.concat(chunks).toString('utf8');resolve(body?JSON.parse(body):{})}
  catch{reject(Object.assign(new Error('Invalid JSON'),{status:400}))}
 });
 req.on('error',err=>{if(!failed){failed=true;reject(err)}});
})}
const error=(message,status=400)=>{throw Object.assign(new Error(message),{status})};
const clean=(s,max=120)=>typeof s==='string'?s.trim().slice(0,max):'';
const validateImageUrl=v=>!v?null:(typeof v==='string'&&/^\/product-images\/[a-f0-9-]{36}\.(png|jpg|webp)$/.test(v)?v:error('Invalid image URL'));
const integer=v=>Number.isSafeInteger(Number(v))?Number(v):NaN;
function audit(id,kind,detail){db.prepare('INSERT INTO events(user_id,kind,detail) VALUES(?,?,?)').run(id,kind,detail)}
function imageUpload(req,res,u){
 if(!u||!['seller','admin'].includes(u.role))error('Seller or admin access required',403);
 return parseBody(req,2800000).then(b=>{
  const raw=typeof b.data==='string'?b.data:'';
  const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(raw);
  if(!match||raw.length>2800000)error('Upload a PNG, JPEG or WebP under 2 MB');
  const bytes=Buffer.from(match[2],'base64');
  if(bytes.length<12||bytes.length>2*1024*1024)error('Invalid image size');
  const kind=match[1],valid=kind==='png'?bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')):kind==='jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
  if(!valid)error('Invalid image file');
  const ext=kind==='jpeg'?'jpg':kind;
  const name=crypto.randomUUID()+'.'+ext;
  fs.writeFileSync(path.join(UPLOADS,name),bytes,{flag:'wx',mode:0o600});
  return reply(res,201,{image_url:'/product-images/'+name});
 });
}
function cartRows(uid){return db.prepare('SELECT p.id,p.name,p.price,p.stock,p.emoji,p.color,c.quantity FROM carts c JOIN products p ON p.id=c.product_id WHERE c.user_id=? AND p.active=1 ORDER BY p.id').all(uid)}
const hits=new Map();function rate(ip){const now=Date.now(),v=hits.get(ip)||{n:0,t:now};if(now-v.t>60000){v.n=0;v.t=now}v.n++;hits.set(ip,v);return v.n<=35}
async function api(req,res,url){const m=req.method,p=url.pathname,u=user(req);if(!['GET','HEAD'].includes(m)){const origin=req.headers.origin;if(origin){let expected;try{expected=new URL(`http://${req.headers.host}`).origin;if(req.headers['x-forwarded-proto']==='https')expected=new URL(`https://${req.headers.host}`).origin}catch{}if(origin!==expected&&!LOCAL_ORIGINS.has(origin))error('Invalid request origin',403)}if(!['application/json','application/json; charset=utf-8'].includes((req.headers['content-type']||'').toLowerCase()))error('JSON content required',415)}
if(m==='POST'&&p==='/api/images')return imageUpload(req,res,u);
if(m==='GET'&&p==='/api/health')return reply(res,200,{ok:true});
if(m==='GET'&&p==='/api/me')return reply(res,200,{user:u});
if(m==='POST'&&p==='/api/auth/register'){if(!rate(req.socket.remoteAddress||''))error('Too many attempts',429);const b=await parseBody(req),name=clean(b.name,70),email=clean(b.email,150).toLowerCase(),pass=b.password,role=b.role==='seller'?'seller':b.role==='buyer'||b.role===undefined?'customer':null;if(!role)error('Choose Buyer or Seller');if(name.length<2||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||typeof pass!=='string'||pass.length<10||pass.length>128)error('Provide a name, valid email, and password of at least 10 characters');if(db.prepare('SELECT id FROM users WHERE email=?').get(email))error('Email already registered',409);const id=Number(db.prepare('INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)').run(name,email,hash(pass),role).lastInsertRowid);newSession(res,id);return reply(res,201,{user:{id,name,email,role}})}
if(m==='POST'&&p==='/api/auth/login'){if(!rate(req.socket.remoteAddress||''))error('Too many attempts',429);const b=await parseBody(req),email=clean(b.email,150).toLowerCase(),row=db.prepare('SELECT * FROM users WHERE email=?').get(email);if(!row||typeof b.password!=='string'||!verify(b.password,row.password))error('Invalid email or password',401);newSession(res,row.id);return reply(res,200,{user:{id:row.id,name:row.name,email:row.email,role:row.role}})}
if(m==='POST'&&p==='/api/auth/forgot-password'){
 if(!rate(req.socket.remoteAddress||''))error('Too many attempts',429);
 const b=await parseBody(req),email=clean(b.email,150).toLowerCase();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))error('Enter a valid email address');
 const message='If an account exists for that email, a password reset link has been sent.';
 const row=db.prepare('SELECT id FROM users WHERE email=?').get(email);
 if(row){
  db.prepare('DELETE FROM password_resets WHERE user_id=? OR expires_at<?').run(row.id,Date.now());
  const token=crypto.randomBytes(32).toString('hex'),tokenHash=crypto.createHash('sha256').update(token).digest('hex');
  db.prepare('INSERT INTO password_resets(token_hash,user_id,expires_at) VALUES(?,?,?)').run(tokenHash,row.id,Date.now()+15*60*1000);
  const localOrigins=process.env.NODE_ENV==='production'?[]:JSON.parse(process.env.PORTFOLIO_LOCAL_ORIGINS||'[]');
  const base=localOrigins.includes(req.headers.origin)?req.headers.origin+(process.env.PORTFOLIO_LOCAL_ORIGINS?'/shopsphere':''):(process.env.PUBLIC_URL||`http://localhost:${PORT}`);
  const link=base.replace(/\/$/,'')+'/#reset-password?token='+encodeURIComponent(token);
  if(process.env.RESEND_API_KEY&&process.env.RESET_FROM_EMAIL){
   try{const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:process.env.RESET_FROM_EMAIL,to:[email],subject:'Reset your ShopSphere password',text:'Use this link within 15 minutes to reset your ShopSphere password: '+link+'\n\nIf you did not request this, ignore this email.'})});if(!response.ok){console.error('Password reset email delivery failed:',response.status);db.prepare('DELETE FROM password_resets WHERE token_hash=?').run(tokenHash)}}catch(e){console.error('Password reset email delivery failed:',e.message);db.prepare('DELETE FROM password_resets WHERE token_hash=?').run(tokenHash)}
  }else if(process.env.NODE_ENV!=='production')console.log('[LOCAL DEV ONLY] Password reset link for '+email+': '+link);
  else {db.prepare('DELETE FROM password_resets WHERE token_hash=?').run(tokenHash);console.error('Password reset email provider is not configured')}
 }
 return reply(res,200,{message});
}
if(m==='POST'&&p==='/api/auth/reset-password'){
 if(!rate(req.socket.remoteAddress||''))error('Too many attempts',429);
 const b=await parseBody(req),token=typeof b.token==='string'?b.token:'',password=b.password;
 if(!/^[a-f0-9]{64}$/.test(token)||typeof password!=='string'||password.length<10||password.length>128)error('Invalid reset link or password');
 const tokenHash=crypto.createHash('sha256').update(token).digest('hex');
 const reset=db.prepare('SELECT user_id FROM password_resets WHERE token_hash=? AND expires_at>?').get(tokenHash,Date.now());
 if(!reset)error('This reset link is invalid or expired',400);
 db.exec('BEGIN IMMEDIATE');try{
  db.prepare('UPDATE users SET password=? WHERE id=?').run(hash(password),reset.user_id);
  db.prepare('DELETE FROM password_resets WHERE user_id=?').run(reset.user_id);
  db.prepare('DELETE FROM sessions WHERE user_id=?').run(reset.user_id);
  db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e}
 return reply(res,200,{message:'Password updated. Please sign in again.'});
}
if(m==='POST'&&p==='/api/auth/logout'){const t=cookie(req);if(t)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(crypto.createHash('sha256').update(t).digest('hex'));res.setHeader('Set-Cookie','session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');return reply(res,200,{ok:true})}
if(m==='GET'&&p==='/api/products'){let rows=db.prepare('SELECT * FROM products WHERE active=1 ORDER BY featured DESC,id').all();const q=clean(url.searchParams.get('q')||'',100).toLowerCase(),cat=clean(url.searchParams.get('category')||'',40);if(q)rows=rows.filter(x=>(x.name+' '+x.description+' '+x.category).toLowerCase().includes(q));if(cat&&cat!=='All')rows=rows.filter(x=>x.category===cat);const sort=url.searchParams.get('sort');if(sort==='price-asc')rows.sort((a,b)=>a.price-b.price);if(sort==='price-desc')rows.sort((a,b)=>b.price-a.price);return reply(res,200,{products:rows})}
if(m==='GET'&&p.startsWith('/api/products/')){const row=db.prepare('SELECT * FROM products WHERE id=? AND active=1').get(integer(p.split('/')[3]));if(!row)error('Product not found',404);return reply(res,200,{product:row})}
if(!u)error('Please sign in',401);
if(p.startsWith('/api/seller/')){
 if(u.role!=='seller')error('Seller access required',403);
 if(m==='GET'&&p==='/api/seller/overview'){
  const products=db.prepare('SELECT * FROM products WHERE seller_id=? AND active=1 ORDER BY id DESC').all(u.id);
  const orders=db.prepare('SELECT o.id order_id,o.status,o.created_at,o.user_id,oi.product_id,oi.product_name,oi.price,oi.quantity FROM order_items oi JOIN orders o ON o.id=oi.order_id JOIN products p ON p.id=oi.product_id WHERE p.seller_id=? ORDER BY o.id DESC LIMIT 100').all(u.id);
  const stats={products:products.length,stock:products.reduce((n,p)=>n+p.stock,0),unitsSold:orders.reduce((n,o)=>n+o.quantity,0),sales:orders.reduce((n,o)=>n+o.price*o.quantity,0)};
  return reply(res,200,{products,orders,stats});
 }
 if(m==='POST'&&p==='/api/seller/products'){
  const b=await parseBody(req),name=clean(b.name,100),category=clean(b.category,40),description=clean(b.description,600),price=integer(b.price),stock=integer(b.stock),emoji=clean(b.emoji,12)||'📦',color=clean(b.color,30)||'#cbd5e1';
  if(name.length<2||!category||!description||!Number.isSafeInteger(price)||price<1||price>100000000||!Number.isSafeInteger(stock)||stock<0||stock>100000||!/^#[0-9a-fA-F]{6}$/.test(color))error('Invalid product fields');
  const id=Number(db.prepare('INSERT INTO products(name,category,description,price,stock,emoji,color,featured,seller_id,image_url) VALUES(?,?,?,?,?,?,?,0,?,?)').run(name,category,description,price,stock,emoji,color,u.id,validateImageUrl(b.image_url)).lastInsertRowid);
  audit(u.id,'inventory',`Seller created product #${id}`);return reply(res,201,{id,stock});
 }
 if(m==='POST'&&/^\/api\/seller\/products\/\d+\/receive$/.test(p)){
  const id=integer(p.split('/')[4]),b=await parseBody(req),quantity=integer(b.quantity),product=db.prepare('SELECT stock FROM products WHERE id=? AND seller_id=? AND active=1').get(id,u.id);
  if(!product)error('Product not found in your store',404);
  if(!Number.isSafeInteger(quantity)||quantity<1||quantity>100000||product.stock+quantity>100000)error('Invalid restock quantity');
  db.prepare('UPDATE products SET stock=stock+? WHERE id=? AND seller_id=?').run(quantity,id,u.id);
  audit(u.id,'inventory',`Seller received ${quantity} units for #${id}`);return reply(res,200,{id,stock:product.stock+quantity});
 }
 if(m==='PATCH'&&/^\/api\/seller\/products\/\d+$/.test(p)){
  const id=integer(p.split('/')[4]),b=await parseBody(req),price=integer(b.price),stock=integer(b.stock);
  if(!Number.isSafeInteger(price)||price<1||price>100000000||!Number.isSafeInteger(stock)||stock<0||stock>100000)error('Invalid price or stock');
  const result=db.prepare('UPDATE products SET price=?,stock=? WHERE id=? AND seller_id=? AND active=1').run(price,stock,id,u.id);
  if(!result.changes)error('Product not found in your store',404);
  audit(u.id,'inventory',`Seller updated #${id}`);return reply(res,200,{ok:true});
 }
 error('Seller endpoint not found',404);
}

if(u.role==='seller' && !p.startsWith('/api/seller/'))error('Seller accounts cannot place customer orders',403);
if(m==='GET'&&p==='/api/cart')return reply(res,200,{items:cartRows(u.id)});
if(m==='POST'&&p==='/api/cart'){const b=await parseBody(req),id=integer(b.productId),qty=integer(b.quantity||1),product=db.prepare('SELECT id,stock FROM products WHERE id=? AND active=1').get(id);if(!product)error('Product not found',404);if(qty<1||qty>20)error('Quantity must be 1–20');const prev=db.prepare('SELECT quantity FROM carts WHERE user_id=? AND product_id=?').get(u.id,id);const next=(prev?.quantity||0)+qty;if(next>product.stock)error('Not enough stock');db.prepare('INSERT INTO carts(user_id,product_id,quantity) VALUES(?,?,?) ON CONFLICT(user_id,product_id) DO UPDATE SET quantity=excluded.quantity').run(u.id,id,next);return reply(res,200,{items:cartRows(u.id)})}
if(m==='PATCH'&&p.startsWith('/api/cart/')){const id=integer(p.split('/')[3]),b=await parseBody(req),qty=integer(b.quantity),product=db.prepare('SELECT stock FROM products WHERE id=?').get(id);if(!product)error('Product not found',404);if(qty<0||qty>20||qty>product.stock)error('Invalid quantity or insufficient stock');if(qty===0)db.prepare('DELETE FROM carts WHERE user_id=? AND product_id=?').run(u.id,id);else db.prepare('UPDATE carts SET quantity=? WHERE user_id=? AND product_id=?').run(qty,u.id,id);return reply(res,200,{items:cartRows(u.id)})}
if(m==='DELETE'&&p.startsWith('/api/cart/')){db.prepare('DELETE FROM carts WHERE user_id=? AND product_id=?').run(u.id,integer(p.split('/')[3]));return reply(res,200,{items:cartRows(u.id)})}
if(m==='POST'&&p==='/api/checkout'){const b=await parseBody(req);if(b.confirm!=='demo')error('Demo checkout confirmation required');db.exec('BEGIN IMMEDIATE');try{const items=cartRows(u.id);if(!items.length)error('Your cart is empty');for(const x of items){const current=db.prepare('SELECT stock FROM products WHERE id=? AND active=1').get(x.id);if(!current||current.stock<x.quantity)error(`${x.name} is out of stock`,409)}const total=items.reduce((sum,x)=>sum+x.price*x.quantity,0),orderId=Number(db.prepare('INSERT INTO orders(user_id,total,status) VALUES(?,?,?)').run(u.id,total,'Placed').lastInsertRowid);for(const x of items){db.prepare('INSERT INTO order_items(order_id,product_id,product_name,price,quantity) VALUES(?,?,?,?,?)').run(orderId,x.id,x.name,x.price,x.quantity);db.prepare('UPDATE products SET stock=stock-? WHERE id=?').run(x.quantity,x.id)}db.prepare('DELETE FROM carts WHERE user_id=?').run(u.id);audit(u.id,'order',`Placed demo order #${orderId}`);db.exec('COMMIT');return reply(res,201,{orderId,total,message:'Demo order placed. No payment was collected.'})}catch(e){db.exec('ROLLBACK');throw e}}
if(m==='GET'&&p==='/api/orders'){const orders=db.prepare('SELECT * FROM orders WHERE user_id=? ORDER BY id DESC').all(u.id);for(const o of orders)o.items=db.prepare('SELECT * FROM order_items WHERE order_id=?').all(o.id);return reply(res,200,{orders})}
if(p.startsWith('/api/admin/')){if(u.role!=='admin')error('Admin access required',403);
if(m==='GET'&&p==='/api/admin/overview'){const stats={products:db.prepare('SELECT count(*) n FROM products WHERE active=1').get().n,orders:db.prepare('SELECT count(*) n FROM orders').get().n,revenue:db.prepare('SELECT coalesce(sum(total),0) n FROM orders').get().n,customers:db.prepare("SELECT count(*) n FROM users WHERE role='customer'").get().n};return reply(res,200,{stats,products:db.prepare('SELECT * FROM products WHERE active=1 ORDER BY id').all(),orders:db.prepare('SELECT o.*,u.name customer FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.id DESC LIMIT 15').all()})}
if(m==='POST'&&p==='/api/admin/products'){const b=await parseBody(req),name=clean(b.name,100),category=clean(b.category,40),description=clean(b.description,600),price=integer(b.price),stock=integer(b.stock),emoji=clean(b.emoji,12)||'📦',color=clean(b.color,30)||'#cbd5e1';if(name.length<2||!category||!description||!Number.isSafeInteger(price)||price<1||price>100000000||!Number.isSafeInteger(stock)||stock<0||stock>100000||!/^#[0-9a-fA-F]{6}$/.test(color))error('Invalid product fields');const id=Number(db.prepare('INSERT INTO products(name,category,description,price,stock,emoji,color,featured,image_url) VALUES(?,?,?,?,?,?,?,0,?)').run(name,category,description,price,stock,emoji,color,validateImageUrl(b.image_url)).lastInsertRowid);audit(u.id,'inventory',`Created product #${id} with ${stock} units`);return reply(res,201,{id,stock})}
if(m==='POST'&&/^\/api\/admin\/products\/\d+\/receive$/.test(p)){const id=integer(p.split('/')[4]),b=await parseBody(req),quantity=integer(b.quantity),product=db.prepare('SELECT id,stock FROM products WHERE id=? AND active=1').get(id);if(!product)error('Product not found',404);if(!Number.isSafeInteger(quantity)||quantity<1||quantity>100000||product.stock+quantity>100000)error('Invalid restock quantity');db.prepare('UPDATE products SET stock=stock+? WHERE id=?').run(quantity,id);audit(u.id,'inventory',`Received ${quantity} units for product #${id}`);return reply(res,200,{id,stock:product.stock+quantity})}
if(m==='PATCH'&&/^\/api\/admin\/products\/\d+$/.test(p)){const id=integer(p.split('/')[4]),b=await parseBody(req),product=db.prepare('SELECT id FROM products WHERE id=?').get(id);if(!product)error('Product not found',404);const price=integer(b.price),stock=integer(b.stock);if(price<1||price>100000000||stock<0||stock>100000)error('Invalid price or stock');db.prepare('UPDATE products SET price=?,stock=? WHERE id=?').run(price,stock,id);audit(u.id,'inventory',`Updated product #${id}`);return reply(res,200,{ok:true})}
if(m==='PATCH'&&/^\/api\/admin\/orders\/\d+$/.test(p)){const id=integer(p.split('/')[4]),b=await parseBody(req),allowed=['Placed','Processing','Shipped','Delivered'];if(!allowed.includes(b.status))error('Invalid status');const r=db.prepare('UPDATE orders SET status=? WHERE id=?').run(b.status,id);if(!r.changes)error('Order not found',404);return reply(res,200,{ok:true})}
}
error('Not found',404)}
const server=http.createServer(async(req,res)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('X-Frame-Options','DENY');res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");if(process.env.NODE_ENV==='production')res.setHeader('Strict-Transport-Security','max-age=31536000');try{const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);if(url.pathname.startsWith('/api/'))return await api(req,res,url);
if(/^\/product-images\/[a-f0-9-]{36}\.(png|jpg|webp)$/.test(url.pathname)){if(!['GET','HEAD'].includes(req.method))return reply(res,405,{error:'Method not allowed'});const file=path.join(UPLOADS,path.basename(url.pathname));const st=fs.statSync(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'image/jpeg','Content-Length':st.size,'Cache-Control':'public, max-age=86400','X-Content-Type-Options':'nosniff'});return req.method==='HEAD'?res.end():fs.createReadStream(file).pipe(res)}if(!['GET','HEAD'].includes(req.method))return reply(res,405,{error:'Method not allowed'});const pathname=url.pathname==='/'?'/index.html':url.pathname;const root=path.join(__dirname,'public');const file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep))return reply(res,403,{error:'Forbidden'});const st=fs.statSync(file);if(!st.isFile())return reply(res,404,{error:'Not found'});res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});if(req.method==='HEAD')return res.end();fs.createReadStream(file).pipe(res)}catch(e){if(e.code==='ENOENT'||e.code==='ENOTDIR')return reply(res,404,{error:'Not found'});if(!e.status)console.error(e);if(!res.headersSent)reply(res,e.status||500,{error:e.status?e.message:'Internal server error'})}});
if(require.main===module)server.listen(PORT,HOST,()=>console.log(`ShopSphere listening at http://localhost:${PORT}`));
module.exports={server,db};
