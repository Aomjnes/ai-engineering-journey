// Nhắc học qua Telegram. Không cần AI nên chạy được trên GitHub Actions, kể cả khi máy tính tắt.
// node tro-ly/nhac-nho.js sang | trua | chieu | toi | khuya | tuan | tu-dong
// Giọng: biến môi trường GIONG=xucpham (chửi thẳng, xưng mày), gat (mặc định, mỉa mai) hoặc hien (nhẹ nhàng).
// Câu của giọng gắt nằm trong tro-ly/cau-nhac.js và được chọn theo ngày, nên mỗi ngày một khác.
'use strict';
const C = require('./chung');
const GIONG = (process.env.GIONG || 'gat').trim();
// gat: kho cau-nhac.js; xucpham: kho cau-xuc-pham.js, thiếu kho nào thì lấy của cau-nhac.js.
const K = GIONG === 'xucpham' ? { ...require('./cau-nhac'), ...require('./cau-xuc-pham') } : require('./cau-nhac');
const CAC_CHE_DO = ['sang', 'trua', 'chieu', 'toi', 'khuya', 'tuan'];

function cheDo(arg) {
  if (CAC_CHE_DO.includes(arg)) return arg;
  const d = new Date(), h = d.getHours();
  if (d.getDay() === 0) return 'tuan';
  return h < 10 ? 'sang' : h < 15 ? 'trua' : h < 19 ? 'chieu' : h < 22 ? 'toi' : 'khuya';
}

// Chọn câu theo ngày: mỗi kho câu được xáo lại mỗi vòng và đi hết kho rồi mới lặp.
// Các kho dài khác nhau nên tổ hợp câu của một ngày gần như không bao giờ trùng ngày khác.
function hashStr(s) { let h = 2166136261; for (const ch of s) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) {
  return () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const soNgay = () => Math.round(Date.UTC(...C.homNay().split('-').map((x, i) => i === 1 ? x - 1 : +x)) / 864e5);
function xao(n, khoa, vong) {
  const r = rng(hashStr(khoa + ':' + vong)), idx = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  return idx;
}
function viTri(n, khoa, ngay) {
  if (n <= 2) return (ngay + hashStr(khoa)) % n; // kho 1-2 câu: luân phiên
  const vong = Math.floor(ngay / n), p = xao(n, khoa, vong);
  // Chỗ nối hai vòng: câu đầu vòng mới không được trùng câu cuối vòng trước (tức câu hôm qua).
  if (p[0] === xao(n, khoa, vong - 1)[n - 1]) [p[0], p[1]] = [p[1], p[0]];
  return p[ngay % n];
}
function chon(arr, khoa, vars, ngay = soNgay()) {
  let s = arr[viTri(arr.length, khoa, ngay)];
  for (const k in vars || {}) s = s.split('{' + k + '}').join(String(vars[k]));
  return s;
}

const buoi = t => 'Tuần ' + t.w.n + ' Buổi ' + (t.i + 1) + ': ' + t.t;

// Số ngày học (thứ hai đến thứ bảy) đã trôi qua kể từ lần cuối có học.
function ngayBo(td) {
  const ngay = new Set(Object.values(td.done)); td.log.forEach(e => ngay.add(e.date));
  const cuoi = [...ngay].sort().pop();
  const tu = C.parse(cuoi || td.start), den = C.parse(C.homNay());
  if (!cuoi) tu.setDate(tu.getDate() - 1);
  let n = 0; const d = new Date(tu); d.setDate(d.getDate() + 1);
  for (let i = 0; i < 400 && d < den; i++) { if (d.getDay() !== 0) n++; d.setDate(d.getDate() + 1); }
  return n;
}

function chuaBatDau(td) { return C.parse(C.homNay()) < C.parse(td.start) && td.soXong === 0; }
function daHocHomNay(td) { return td.xongHomNay.length > 0 || td.logHomNay.length > 0; }

/* ---------- Giọng gắt ---------- */
function soLich(td, khoa) {
  if (chuaBatDau(td)) return 'Lịch bắt đầu ngày ' + td.start + '. Đến lúc đó đừng có kiếm cớ.';
  const n = Math.abs(td.chenh);
  if (td.chenh > 0) return chon(K.NHANH, khoa + 'nhanh', { n });
  if (td.chenh === 0) return chon(K.DUNG, khoa + 'dung');
  if (n <= 2) return chon(K.CHAM_IT, khoa + 'chamit', { n });
  if (n <= 6) return chon(K.CHAM_VUA, khoa + 'chamvua', { n, tuan: n >= 6 ? 'trọn một tuần' : n >= 4 ? 'gần một tuần' : 'nửa tuần' });
  return chon(K.CHAM_NHIEU, khoa + 'chamnhieu', { n });
}

// Dòng trạng thái cho tin "chưa học hôm nay": chỉ số liệu thật, không bao giờ "đúng lịch" khi hôm nay vẫn 0 buổi.
function trangThaiChuaHoc(td, khoa) {
  const L = ['Hôm nay: 0 buổi · Đã xong ' + td.soXong + ' buổi.'];
  if (!chuaBatDau(td) && td.chenh < 0) L.push(soLich(td, khoa));
  return L.join(' ');
}

function cauBo(n, khoa) {
  if (n <= 0) return '';
  if (n === 1) return chon(K.BO_1, khoa + 'bo1');
  if (n <= 3) return chon(K.BO_2_3, khoa + 'bo23', { n });
  if (n <= 6) return chon(K.BO_4_6, khoa + 'bo46', { n });
  return chon(K.BO_NHIEU, khoa + 'bonhieu', { n });
}

function gatSang(td) {
  if (!td.next) return 'Xong cả 52 tuần rồi. Giờ đi làm portfolio đi, đừng ngồi tự hào mãi.';
  if (chuaBatDau(td)) return 'Lịch học bắt đầu ngày ' + td.start + '. Chuẩn bị máy cho xong đi, đừng để ngày đầu đã kiếm cớ.';
  const w = td.next.w;
  return [
    chon(K.SANG, 'sang'), cauBo(ngayBo(td), 'sang'),
    '',
    'Việc hôm nay (' + C.THU[new Date().getDay()] + '): ' + buoi(td.next),
    'Tài liệu: ' + w.r.map(r => r[0] + ' ' + r[1]).join(' · '),
    '',
    soLich(td, 'sang') + ' Chuỗi ngày học: ' + td.chuoi + ' ngày.',
    'Học xong thì điền báo cáo 5 mục và chấm điểm. Không ghi lại thì coi như chưa học.',
  ].filter((x, i, a) => x !== '' || a[i - 1] !== '').join('\n');
}

function gatGiuaNgay(td, kho, khoa) {
  if (!td.next || chuaBatDau(td) || daHocHomNay(td)) return null; // đã học thì im
  return [chon(kho, khoa), cauBo(ngayBo(td), khoa), 'Việc đang chờ: ' + buoi(td.next), chon(K.KET, khoa + 'ket')]
    .filter(Boolean).join('\n');
}

function gatToi(td) {
  if (!td.next) return 'Đã xong toàn bộ lộ trình.';
  if (chuaBatDau(td)) return null;
  if (daHocHomNay(td)) {
    const L = [chon(K.DA_HOC_TOI, 'toidahoc') + ' Chuỗi: ' + td.chuoi + ' ngày.'];
    if (!td.logHomNay.length) L.push(chon(K.CHUA_GHI, 'toichuaghi'));
    else {
      const e = td.logHomNay[td.logHomNay.length - 1];
      L.push(Number(e.min) < 90 ? chon(K.HOC_IT, 'hocit', { phut: e.min }) : chon(K.HOC_DU, 'hocdu'));
    }
    L.push('Ngày mai: ' + buoi(td.next));
    return L.join('\n');
  }
  return [chon(K.TOI_CHUA, 'toi'), cauBo(ngayBo(td), 'toi'),
    'Vẫn còn kịp 25 phút cho phần đầu của ' + buoi(td.next) + '. Làm ngay, hoặc chấp nhận hôm nay là ngày bỏ.', trangThaiChuaHoc(td, 'toi')]
    .filter(Boolean).join('\n');
}

function gatKhuya(td) {
  if (!td.next || chuaBatDau(td)) return null;
  if (daHocHomNay(td)) return td.logHomNay.length ? null : chon(K.CHUA_GHI, 'khuyachuaghi');
  return [chon(K.KHUYA, 'khuya'), trangThaiChuaHoc(td, 'khuya')].join('\n');
}

function gatTuan(td) {
  if (chuaBatDau(td)) return 'Tuần sau bắt đầu học (' + td.start + '). Tối nay chuẩn bị máy, tài khoản GitHub cho xong. Ngày đầu mà còn loay hoay cài đặt thì đừng đổ tại ai.';
  const tu = new Date(); tu.setDate(tu.getDate() - 6);
  const moc = C.iso(tu);
  const xong = Object.values(td.done).filter(d => d >= moc).length;
  const log = td.log.filter(e => e.date >= moc);
  const phut = log.reduce((a, e) => a + (Number(e.min) || 0), 0);
  const L = ['Tổng kết tuần (' + moc + ' đến ' + C.homNay() + '): ' + xong + '/6 buổi, ' + (phut / 60).toFixed(1) + ' giờ đã ghi.'];
  L.push(xong === 0 ? chon(K.TUAN_0, 't0') : xong < 4 ? chon(K.TUAN_IT, 'tit', { x: xong }) : xong < 6 ? chon(K.TUAN_GAN, 'tgan', { x: xong }) : chon(K.TUAN_DU, 'tdu'));
  if (phut && phut < 600) L.push('Tổng ' + (phut / 60).toFixed(1) + ' giờ trong khi cần khoảng 12 giờ một tuần. Phần còn lại đi đâu?');
  if (log.length) {
    const tb = k => log.reduce((a, e) => a + (Number(e[k]) || 0), 0) / log.length;
    const k = tb('k'), c = tb('c'), g = tb('g'), d = tb('d'), all = (k + c + g + d) / 4;
    L.push('Điểm trung bình: khái niệm ' + k.toFixed(1) + ', code ' + c.toFixed(1) + ', gỡ lỗi ' + g.toFixed(1) + ', kỷ luật ' + d.toFixed(1) + ' (chung ' + all.toFixed(1) + ').');
    L.push(all < 3 ? 'Dưới 3. Theo luật, tuần sau học lại tuần này. Tự chuốc lấy, giờ tự trả.' : 'Đạt. Tuần sau đi tiếp, đừng tự mãn.');
  } else if (xong) L.push('Học mà không ghi điểm buổi nào. Không đo thì không biết mình tệ ở đâu.');
  L.push(soLich(td, 'tuan'));
  L.push(chon(K.CN, 'cn'));
  if (td.next) L.push('Thứ hai: ' + buoi(td.next));
  return L.join('\n');
}

/* ---------- Giọng hiền ---------- */
function hienLich(td) {
  if (chuaBatDau(td)) return 'Lịch bắt đầu ngày ' + td.start + '.';
  if (td.chenh > 0) return 'Bạn đang nhanh ' + td.chenh + ' buổi so với lịch.';
  if (td.chenh < 0) return 'Bạn đang chậm ' + (-td.chenh) + ' buổi. Cứ học tiếp từ chỗ dừng, không cần học bù gấp đôi.';
  return 'Bạn đang đúng lịch.';
}
function hien(mode, td) {
  if (!td.next) return 'Bạn đã xong cả 52 tuần.';
  if (mode === 'sang') return 'Chào buổi sáng. Hôm nay: ' + buoi(td.next) + '\n' + hienLich(td) + ' Chuỗi: ' + td.chuoi + ' ngày.';
  if (mode === 'trua' || mode === 'chieu' || mode === 'khuya') return daHocHomNay(td) || chuaBatDau(td) ? null : 'Nhắc nhẹ: hôm nay chưa học. Chỉ cần 25 phút cho ' + buoi(td.next) + '.';
  if (mode === 'toi') return daHocHomNay(td) ? 'Hôm nay bạn đã học. Nhớ ghi điểm nhé.' : 'Hôm nay bạn chưa học. Nếu còn sức, 25 phút thôi. ' + hienLich(td);
  return 'Tổng kết tuần: ' + hienLich(td) + ' Chuỗi: ' + td.chuoi + ' ngày.';
}

function soanTin(mode, td) {
  if (GIONG === 'hien') return hien(mode, td);
  if (mode === 'sang') return gatSang(td);
  if (mode === 'trua') return gatGiuaNgay(td, K.TRUA, 'trua');
  if (mode === 'chieu') return gatGiuaNgay(td, K.CHIEU, 'chieu');
  if (mode === 'toi') return gatToi(td);
  if (mode === 'khuya') return gatKhuya(td);
  return gatTuan(td);
}

module.exports = { soanTin, ngayBo, chon };

if (require.main === module) (async () => {
  const cfg = C.docCauHinh(), lt = C.docLoTrinh();
  if (!cfg.telegramToken || !cfg.telegramChatId) console.log('Cảnh báo: chưa có TELEGRAM_TOKEN hoặc TELEGRAM_CHAT_ID, tin nhắn chỉ được in ra.');
  const state = await C.docDoc(cfg, 'state');
  const td = C.tienDo(state, lt), mode = cheDo(process.argv[2]);
  const text = soanTin(mode, td);
  if (!text) { console.log('Không cần nhắc lúc "' + mode + '" (đã học hoặc chưa tới ngày bắt đầu).'); return; }
  await C.guiTin(cfg, text);
  console.log('Đã gửi lời nhắc "' + mode + '" (giọng ' + GIONG + ').');
})().catch(e => { console.error('Lỗi: ' + e.message); process.exit(1); });
