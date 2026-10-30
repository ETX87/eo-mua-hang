#!/usr/bin/env node
// ── TRỢ LÝ MÂY · ĐỌC DỮ LIỆU & LOG THẬT (CHỈ ĐỌC) ──────────────────────────────────────────────────
// Dùng trong workflow may-tu-sua (sau bước xác thực WIF): tài khoản may-deployer chỉ có quyền datastore.viewer + logging.viewer,
// nên công cụ này KHÔNG THỂ ghi/xoá gì. Project lấy từ env MAY_PROJECT (vars.FIREBASE_PROJECT) hoặc tham số --project.
//   node .github/may-du-lieu.mjs doc   <collection>/<id>[/<sub>/<id>]        → một tài liệu
//   node .github/may-du-lieu.mjs list  <collection> [--limit 20]             → vài tài liệu đầu (mặc định 20)
//   node .github/may-du-lieu.mjs query <collection> <field> <op> <value> [--limit 20]
//        op: == != < <= > >= array-contains in   (value: chuỗi; số/true/false/null tự nhận; in: a,b,c)
//   node .github/may-du-lieu.mjs count <collection> [<field> <op> <value>]  → đếm
//   node .github/may-du-lieu.mjs log   "<bộ lọc Cloud Logging>" [--limit 50] [--hours 24]
//        vd: log 'resource.labels.service_name="taobaocao" AND severity>=ERROR'
//   node .github/may-du-lieu.mjs collections [<doc path>]                   → tên các collection
// Kết quả in JSON. LUẬT: KHÔNG dán nội dung cá nhân (tên, SĐT, email, CCCD, số tiền của khách/nhân sự) vào PR, issue, nhật ký — chỉ ghi mã bản ghi.
import { execFileSync } from 'node:child_process'

const args = process.argv.slice(2)
const opt = (k, d) => { const i = args.indexOf('--' + k); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v }
const project = opt('project', process.env.MAY_PROJECT || process.env.FIREBASE_PROJECT || process.env.GCLOUD_PROJECT)
const limit = Number(opt('limit', 20))
const hours = Number(opt('hours', 24))
const [lenh, ...rest] = args
if (!project) { console.error('Thiếu project: đặt env MAY_PROJECT hoặc --project <id>'); process.exit(2) }
if (!lenh) { console.error('Cách dùng: xem đầu tệp'); process.exit(2) }

const token = execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' }).trim()
const FS = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`
const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

// Firestore REST → giá trị JS thường
const giaTri = (v) => {
  if (v == null) return null
  if ('stringValue' in v) return v.stringValue
  if ('integerValue' in v) return Number(v.integerValue)
  if ('doubleValue' in v) return v.doubleValue
  if ('booleanValue' in v) return v.booleanValue
  if ('nullValue' in v) return null
  if ('timestampValue' in v) return v.timestampValue
  if ('referenceValue' in v) return v.referenceValue.split('/documents/')[1]
  if ('geoPointValue' in v) return v.geoPointValue
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(giaTri)
  if ('mapValue' in v) return doc(v.mapValue)
  return v
}
const doc = (d) => Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, giaTri(v)]))
const chuanDoc = (d) => ({ _id: d.name.split('/').pop(), _path: d.name.split('/documents/')[1], ...doc(d) })
const vaoGiaTri = (s) => {
  if (s === 'true') return { booleanValue: true }; if (s === 'false') return { booleanValue: false }; if (s === 'null') return { nullValue: null }
  if (/^-?\d+$/.test(s)) return { integerValue: s }; if (/^-?\d+\.\d+$/.test(s)) return { doubleValue: Number(s) }
  return { stringValue: s }
}
const OP = { '==': 'EQUAL', '!=': 'NOT_EQUAL', '<': 'LESS_THAN', '<=': 'LESS_THAN_OR_EQUAL', '>': 'GREATER_THAN', '>=': 'GREATER_THAN_OR_EQUAL', 'array-contains': 'ARRAY_CONTAINS', in: 'IN' }
const where = (field, op, value) => {
  if (!OP[op]) throw new Error('op không hợp lệ: ' + op)
  const v = op === 'in' ? { arrayValue: { values: value.split(',').map(vaoGiaTri) } } : vaoGiaTri(value)
  return { fieldFilter: { field: { fieldPath: field }, op: OP[op], value: v } }
}
async function goi(url, body) {
  const r = await fetch(url, body ? { method: 'POST', headers: H, body: JSON.stringify(body) } : { headers: H })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${j.error?.message || JSON.stringify(j).slice(0, 300)}`)
  return j
}
async function runQuery(collection, dk, lim) {
  const parts = collection.split('/'); const col = parts.pop(); const parent = parts.length ? FS + '/' + parts.join('/') : FS
  const q = { structuredQuery: { from: [{ collectionId: col }], limit: lim } }
  if (dk) q.structuredQuery.where = dk
  const kq = await goi(`${parent}:runQuery`, q)
  return kq.filter((x) => x.document).map((x) => chuanDoc(x.document))
}

try {
  let out
  if (lenh === 'doc') out = chuanDoc(await goi(`${FS}/${rest[0]}`))
  else if (lenh === 'list') out = await runQuery(rest[0], null, limit)
  else if (lenh === 'query') out = await runQuery(rest[0], where(rest[1], rest[2], rest.slice(3).join(' ')), limit)
  else if (lenh === 'count') {
    const parts = rest[0].split('/'); const col = parts.pop(); const parent = parts.length ? FS + '/' + parts.join('/') : FS
    const sq = { from: [{ collectionId: col }] }; if (rest[1]) sq.where = where(rest[1], rest[2], rest.slice(3).join(' '))
    const kq = await goi(`${parent}:runAggregationQuery`, { structuredAggregationQuery: { structuredQuery: sq, aggregations: [{ alias: 'n', count: {} }] } })
    out = { count: Number(kq[0]?.result?.aggregateFields?.n?.integerValue || 0) }
  } else if (lenh === 'collections') {
    const kq = await goi(`${FS}${rest[0] ? '/' + rest[0] : ''}:listCollectionIds`, { pageSize: 200 })
    out = kq.collectionIds || []
  } else if (lenh === 'log') {
    const tu = new Date(Date.now() - hours * 3600e3).toISOString()
    const filter = `${rest.join(' ')} AND timestamp>="${tu}"`
    const txt = execFileSync('gcloud', ['logging', 'read', filter, '--project', project, '--limit', String(limit), '--format', 'json', '--order', 'desc'], { encoding: 'utf8', maxBuffer: 50e6 })
    out = JSON.parse(txt || '[]').map((e) => ({ luc: e.timestamp, muc: e.severity, dichVu: e.resource?.labels?.service_name || e.resource?.labels?.function_name || e.resource?.type, http: e.httpRequest ? `${e.httpRequest.requestMethod} ${e.httpRequest.status}` : undefined, noiDung: (e.textPayload || e.jsonPayload?.message || JSON.stringify(e.jsonPayload || e.protoPayload || '')).slice(0, 2000) }))
  } else throw new Error('Lệnh không hợp lệ: ' + lenh)
  console.log(JSON.stringify(out, null, 2))
} catch (e) { console.error('❌', e.message); process.exit(1) }
