import { createHmac, timingSafeEqual, scryptSync, randomBytes } from 'node:crypto'

const COOKIE = 'pc_admin_session'
const DB_KEY = 'plov-city:react:v1'
const SESSION_TTL = 8 * 60 * 60
const defaultDb = () => ({ menu: [], orders: [], visitors: [], adminPasswordHash: '', adminUsername: process.env.ADMIN_USERNAME || 'owner' })
const redisConfig = () => ({ url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN })

async function redis(command) {
  const { url, token } = redisConfig()
  if (!url || !token) throw Object.assign(new Error('Vercel loyihasida Upstash Redis ulanmagan. Storage → Create Database orqali Redis ulang va redeploy qiling.'), { status: 503 })
  const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(command) })
  const payload = await response.json()
  if (!response.ok || payload.error) throw Object.assign(new Error(payload.error || 'Redis bilan aloqa xatosi.'), { status: 502 })
  return payload.result
}

async function readDb() {
  const result = await redis(['GET', DB_KEY])
  if (!result) return defaultDb()
  try { return { ...defaultDb(), ...JSON.parse(result) } } catch { return defaultDb() }
}
async function writeDb(db) { await redis(['SET', DB_KEY, JSON.stringify(db)]) }
function secret() {
  const value = process.env.ADMIN_SESSION_SECRET
  if (!value || value.length < 32) throw Object.assign(new Error('ADMIN_SESSION_SECRET qiymatini Vercel Environment Variables da kamida 32 belgidan iborat qilib sozlang.'), { status: 503 })
  return value
}
function sign(value) { return createHmac('sha256', secret()).update(value).digest('hex') }
function parseCookies(req) { return Object.fromEntries((req.headers.cookie || '').split(';').map(x => x.trim()).filter(Boolean).map(x => { const i=x.indexOf('='); return [x.slice(0,i), decodeURIComponent(x.slice(i+1))] })) }
function validSession(req) {
  const value = parseCookies(req)[COOKIE] || ''
  const [expires, signature] = value.split('.')
  if (!expires || !signature || Number(expires) < Date.now()) return false
  const expected = Buffer.from(sign(expires), 'hex'), supplied = Buffer.from(signature, 'hex')
  return expected.length === supplied.length && timingSafeEqual(expected, supplied)
}
function setCookie(res, value, maxAge) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(value)}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${maxAge}${secure}`)
}
function json(res, status, data) { res.statusCode=status; res.setHeader('Content-Type','application/json; charset=utf-8'); res.setHeader('Cache-Control','no-store'); res.end(JSON.stringify(data)) }
async function body(req) {
  if (req.body && typeof req.body === 'object') return req.body
  let raw=''; for await (const chunk of req) raw += chunk
  try { return raw ? JSON.parse(raw) : {} } catch { throw Object.assign(new Error('So‘rov formati noto‘g‘ri.'), { status: 400 }) }
}
function hashPassword(password, salt = randomBytes(16).toString('hex')) { return `${salt}:${scryptSync(password, salt, 64).toString('hex')}` }
function checkPassword(password, saved) {
  if (!saved) {
    const configured = process.env.ADMIN_PASSWORD || ''
    return Boolean(configured) && password === configured
  }
  const [salt, digest] = saved.split(':'); if (!salt || !digest) return false
  const expected=Buffer.from(digest,'hex'), actual=scryptSync(password,salt,64)
  return expected.length===actual.length && timingSafeEqual(expected,actual)
}
function getPath(req) { const raw = req.query?.path || new URL(req.url, 'http://localhost').searchParams.get('path') || ''; const clean=String(Array.isArray(raw) ? raw.join('/') : raw).replace(/^\/+/, '').replace(/^api\//, ''); return '/api/' + clean }
function orderStats(db) {
  const revenue=db.orders.filter(o=>o.status!=='cancelled').reduce((s,o)=>s+Number(o.totalPrice||o.total||0),0)
  const ordered=new Set(db.orders.map(o=>o.visitorId).filter(Boolean)).size
  return { visitors:db.visitors.length, orderedVisitors:ordered, browsingOnly:Math.max(0,db.visitors.length-ordered), orders:db.orders.length, totalRevenue:revenue, conversionRate:db.visitors.length ? (ordered/db.visitors.length*100).toFixed(1) : '0.0' }
}

export default async function handler(req, res) {
  try {
    const path=getPath(req), method=req.method || 'GET'
    if (path==='/api/menu' && method==='GET') { const db=await readDb(); return json(res,200,{menu:db.menu}) }
    if (path==='/api/visitors' && method==='POST') {
      const {visitorId}=await body(req); if (!visitorId) return json(res,400,{error:'visitorId talab qilinadi.'})
      const db=await readDb(), now=new Date().toISOString(), found=db.visitors.find(v=>v.id===visitorId)
      if(found){found.lastVisit=now; found.visitCount=(found.visitCount||1)+1} else db.visitors.push({id:visitorId,firstVisit:now,lastVisit:now,visitCount:1,hasOrdered:false})
      await writeDb(db); return json(res,200,{success:true})
    }
    if (path==='/api/orders' && method==='POST') {
      const order=await body(req); if(!order.orderNumber) return json(res,400,{error:'Buyurtma raqami talab qilinadi.'})
      const db=await readDb(); db.orders.unshift(order)
      if(order.visitorId){const visitor=db.visitors.find(v=>v.id===order.visitorId); if(visitor) visitor.hasOrdered=true}
      await writeDb(db); return json(res,201,{success:true})
    }
    if (path==='/api/telegram' && method==='POST') {
      const token=process.env.TELEGRAM_BOT_TOKEN, chatId=process.env.TELEGRAM_CHAT_ID
      if(!token || !chatId) return json(res,503,{error:'Telegram server sozlamalari kiritilmagan.'})
      const {text}=await body(req); if(typeof text!=='string' || text.length>12000) return json(res,400,{error:'Telegram xabari noto‘g‘ri.'})
      const response=await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:chatId,text,parse_mode:'HTML',disable_web_page_preview:true})})
      const result=await response.json(); return json(res,response.ok&&result.ok?200:502,{success:!!(response.ok&&result.ok),error:result.description})
    }
    if (path==='/api/admin/session' && method==='GET') return json(res,200,{authenticated:validSession(req)})
    if (path==='/api/admin/login' && method==='POST') {
      if (!process.env.ADMIN_PASSWORD) throw Object.assign(new Error('Vercel Environment Variables’da ADMIN_PASSWORD ni sozlang.'), { status: 503 })
      const {username,password}=await body(req), db=await readDb()
      const wantedUser=db.adminUsername || process.env.ADMIN_USERNAME || 'owner'
      if(String(username||'').trim()!==wantedUser || !checkPassword(String(password||''),db.adminPasswordHash)) return json(res,401,{error:'Login yoki parol noto‘g‘ri.'})
      const expires=String(Date.now()+SESSION_TTL*1000); setCookie(res,`${expires}.${sign(expires)}`,SESSION_TTL)
      return json(res,200,{success:true,username:wantedUser})
    }
    if (path==='/api/admin/logout' && method==='POST') { setCookie(res,'',0); return json(res,200,{success:true}) }
    if (path.startsWith('/api/admin/') && !validSession(req)) return json(res,401,{error:'Admin panelga kirish uchun tizimga kiring.'})
    if (path==='/api/admin/stats' && method==='GET') { const db=await readDb(); return json(res,200,{menu:db.menu,orders:db.orders,stats:orderStats(db)}) }
    if (path==='/api/admin/menu' && method==='PUT') {
      const {menu}=await body(req); if(!Array.isArray(menu) || menu.length>300) return json(res,400,{error:'Menyu ma’lumotlari noto‘g‘ri yoki juda katta.'})
      const db=await readDb(); db.menu=menu; await writeDb(db); return json(res,200,{success:true,count:menu.length})
    }
    if (path.startsWith('/api/admin/orders/')) {
      const id=decodeURIComponent(path.slice('/api/admin/orders/'.length)), db=await readDb(), index=db.orders.findIndex(o=>o.orderNumber===id)
      if(index<0) return json(res,404,{error:'Buyurtma topilmadi.'})
      if(method==='DELETE') db.orders.splice(index,1)
      else if(method==='PATCH') { const {status}=await body(req); db.orders[index].status=status }
      else return json(res,405,{error:'Method ruxsat etilmagan.'})
      await writeDb(db); return json(res,200,{success:true,order:db.orders[index]||null})
    }
    if (path==='/api/admin/password' && method==='POST') {
      const {currentPassword,newPassword,newUsername}=await body(req), db=await readDb()
      if(!checkPassword(String(currentPassword||''),db.adminPasswordHash)) return json(res,400,{error:'Joriy parol noto‘g‘ri.'})
      if(typeof newPassword!=='string'||newPassword.length<10) return json(res,400,{error:'Yangi parol kamida 10 ta belgidan iborat bo‘lsin.'})
      db.adminPasswordHash=hashPassword(newPassword); db.adminUsername=String(newUsername||db.adminUsername||'owner').trim() || 'owner'; await writeDb(db)
      return json(res,200,{success:true,username:db.adminUsername})
    }
    return json(res,404,{error:'API yo‘li topilmadi.'})
  } catch(error) { console.error('API error:',error); return json(res,error.status||500,{error:error.message||'Serverda kutilmagan xatolik.'}) }
}

