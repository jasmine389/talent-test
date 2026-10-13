/* ============================================================
   天赋职业测评 · 主逻辑
   ============================================================ */

const ALL_TYPES = Object.assign({}, TYPES_RIA, TYPES_SEC);
const DIM_KEYS = DIMENSIONS.map(d => d.key);
const STORAGE_KEY = 'talent_test_answers_v1';

let currentKey = '';
let currentIdx = 0;
let answers = new Array(QUESTIONS.length).fill(0);
let isVerifying = false;
let radarChart = null;

const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));

function showToast(msg, ms = 2200) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), ms);
}

function goPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  $(id).classList.add('active');
  window.scrollTo(0, 0);
}

/* ---------------- 密钥验证 ---------------- */
function getSupabaseClient() {
  if (typeof SUPABASE_URL !== 'string' || !SUPABASE_URL.startsWith('http')) return null;
  if (typeof window.supabase === 'undefined' || !window.supabase.createClient) return null;
  return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

async function verifyKey(key) {
  const client = getSupabaseClient();
  if (!client) {
    // 未配置 Supabase 时的本地降级计数模式
    const raw = localStorage.getItem('talent_keys_v1');
    const map = raw ? JSON.parse(raw) : {};
    if (!map[key]) map[key] = 0;
    if (map[key] >= 3) return { ok: false, message: '该密钥已用完，请更换新密钥' };
    map[key] += 1;
    localStorage.setItem('talent_keys_v1', JSON.stringify(map));
    return { ok: true, remaining: 3 - map[key] };
  }
  const { data, error } = await client.rpc('use_card', { p_code: key });
  if (error) return { ok: false, message: '网络异常，请稍后重试' };
  if (!data || data.ok !== true) {
    return { ok: false, message: (data && data.message) || '密钥无效，请检查输入或联系客服' };
  }
  return { ok: true, remaining: data.remaining };
}

async function checkPassword() {
  const input = $('key-input');
  const btn = $('start-btn');
  const err = $('login-error');
  const key = input.value.trim().toUpperCase();

  err.style.display = 'none';
  if (!key) { err.textContent = '请输入卡密'; err.style.display = 'block'; return; }
  if (isVerifying) return;

  isVerifying = true;
  btn.disabled = true;
  btn.textContent = '验证中…';

  try {
    const res = await verifyKey(key);
    if (res.ok) {
      currentKey = key;
      startQuiz();
    } else {
      err.textContent = res.message;
      err.style.display = 'block';
    }
  } catch (e) {
    err.textContent = '网络异常，请稍后重试';
    err.style.display = 'block';
  } finally {
    isVerifying = false;
    btn.disabled = false;
    btn.textContent = '开 始 测 评';
  }
}

/* ---------------- 答题 ---------------- */
function startQuiz() {
  answers = new Array(QUESTIONS.length).fill(0);
  currentIdx = 0;
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  goPage('quiz-page');
  renderQuestion();
}

function renderQuestion() {
  const q = QUESTIONS[currentIdx];
  const total = QUESTIONS.length;
  const pct = Math.round(((currentIdx + 1) / total) * 100);

  $('q-now').textContent = currentIdx + 1;
  $('q-total').textContent = total;
  $('q-pct').textContent = pct + '%';
  $('progress-fill').style.width = pct + '%';
  $('q-text').textContent = q.text;

  const box = $('options');
  box.innerHTML = '';
  OPTION_LABELS.forEach((label, i) => {
    const b = document.createElement('button');
    b.className = 'option-btn' + (answers[currentIdx] === i + 1 ? ' selected' : '');
    b.textContent = label;
    b.onclick = () => selectOption(i + 1);
    box.appendChild(b);
  });

  $('prev-btn').style.visibility = currentIdx === 0 ? 'hidden' : 'visible';
  $('next-btn').textContent = currentIdx === total - 1 ? '查看我的结果' : '下一题';
}

function selectOption(val) {
  answers[currentIdx] = val;
  renderQuestion();
}

function nextQuestion() {
  if (!answers[currentIdx]) {
    showToast('先选一个最接近你的选项');
    return;
  }
  if (currentIdx === QUESTIONS.length - 1) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(answers)); } catch (e) {}
    showResult();
    return;
  }
  currentIdx++;
  renderQuestion();
}

function prevQuestion() {
  if (currentIdx > 0) {
    currentIdx--;
    renderQuestion();
  }
}

/* ---------------- 计分 ---------------- */
function calcScores() {
  const sums = {}, counts = {};
  DIM_KEYS.forEach(k => { sums[k] = 0; counts[k] = 0; });
  QUESTIONS.forEach((q, i) => {
    const v = answers[i] || 0;
    sums[q.dimension] += v;
    counts[q.dimension] += 1;
  });
  // 每题 1-5 分，换算为 0-100
  const scores = {};
  DIM_KEYS.forEach(k => {
    const max = counts[k] * 5;
    const min = counts[k] * 1;
    scores[k] = Math.round(((sums[k] - min) / (max - min)) * 100);
  });
  return scores;
}

function calcResult(scores) {
  const sorted = DIM_KEYS.slice().sort((a, b) => scores[b] - scores[a]);
  const code = sorted.slice(0, 3);
  const primary = sorted[0];
  return { code, primary, sorted };
}

/* ---------------- 结果渲染 ---------------- */
function showResult() {
  const scores = calcScores();
  const { code, primary } = calcResult(scores);
  const t = ALL_TYPES[primary];

  // 天赋指数：主导维度分 + 前三维均分的加权，55-98 区间
  const avg3 = (scores[code[0]] + scores[code[1]] + scores[code[2]]) / 3;
  const talentIndex = Math.max(55, Math.min(98, Math.round(avg3 * 0.7 + scores[primary] * 0.3)));

  $('r-emoji').textContent = t.emoji;
  $('r-name').textContent = t.name;
  $('r-tag').textContent = t.tag;
  $('r-code').textContent = code.join('-');
  $('r-rarity').textContent = t.rarity;
  $('r-score').textContent = talentIndex;
  $('r-whoami').textContent = t.whoami;

  // 天赋信号
  $('r-signals').innerHTML = t.signals.map(s => `
    <div style="display:flex;gap:12px;margin-bottom:14px">
      <span style="color:#2563eb;font-size:18px;line-height:1.6">✦</span>
      <span style="font-size:16px;line-height:1.75;color:var(--ink-soft)">${s}</span>
    </div>`).join('');

  // 优势 / 陷阱
  $('r-adv').innerHTML = t.advantages.map(s => `
    <div style="display:flex;gap:12px;margin-bottom:14px">
      <span style="color:#2563eb;font-weight:900">✔</span>
      <span style="font-size:16px;line-height:1.75;color:var(--ink-soft)">${s}</span>
    </div>`).join('');
  $('r-traps').innerHTML = t.traps.map(s => `
    <div style="display:flex;gap:12px;margin-bottom:14px">
      <span style="color:#b45309;font-weight:900">⚠</span>
      <span style="font-size:16px;line-height:1.75;color:var(--ink-soft)">${s}</span>
    </div>`).join('');

  // 职业方向
  $('r-careers').innerHTML = t.careers.map(c => `
    <div style="padding:16px 0;border-bottom:1px dashed var(--line)">
      <div style="font-size:17px;font-weight:900;color:var(--blue-800);margin-bottom:8px">${c.label}</div>
      <div style="font-size:15px;color:var(--ink-soft);line-height:1.8">${c.roles}</div>
    </div>`).join('');

  // 薪资
  $('r-salary').innerHTML = t.salary.map(s => `
    <div style="display:flex;justify-content:space-between;gap:14px;padding:13px 0;border-bottom:1px dashed var(--line)">
      <span style="font-size:15px;color:var(--ink-soft);flex:1">${s.stage}</span>
      <b style="font-size:15px;color:var(--blue-700);text-align:right;flex:1.1">${s.range}</b>
    </div>`).join('');

  // 路径
  $('r-path').innerHTML = t.path.map((p, i) => `
    <div style="display:flex;gap:14px;margin-bottom:16px">
      <div style="min-width:70px;height:32px;border-radius:10px;background:linear-gradient(135deg,#3b82f6,#1d4ed8);
        color:#fff;font-size:14px;font-weight:900;display:flex;align-items:center;justify-content:center">${p.stage}</div>
      <div style="font-size:16px;line-height:1.8;color:var(--ink-soft);flex:1">${p.do}</div>
    </div>`).join('');

  // 避坑
  $('r-pitfalls').innerHTML = t.pitfalls.map((p, i) => `
    <div style="display:flex;gap:12px;margin-bottom:14px">
      <span style="min-width:24px;height:24px;border-radius:8px;background:#fef3c7;color:#b45309;
        font-size:13px;font-weight:900;display:flex;align-items:center;justify-content:center">${i + 1}</span>
      <span style="font-size:16px;line-height:1.75;color:var(--ink-soft)">${p}</span>
    </div>`).join('');

  // 行动清单
  $('r-actions').innerHTML = t.actions.map((a, i) => `
    <div style="display:flex;gap:12px;margin-bottom:16px">
      <span style="min-width:26px;height:26px;border-radius:50%;background:#1d4ed8;color:#fff;
        font-size:14px;font-weight:900;display:flex;align-items:center;justify-content:center">${i + 1}</span>
      <span style="font-size:16px;line-height:1.75;color:var(--ink);flex:1">${a}</span>
    </div>`).join('');

  $('r-envfit').textContent = t.envFit;
  $('r-envunfit').textContent = t.envUnfit;
  $('r-partner').textContent = t.partner;

  // 评分条
  const tagOf = v => v >= 80 ? '非常突出' : v >= 60 ? '明显优势' : v >= 45 ? '中等' : v >= 30 ? '偏弱' : '待发展';
  $('r-bars').innerHTML = DIMENSIONS.map(d => {
    const v = scores[d.key];
    return `
    <div style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:7px">
        <span style="font-size:16px;font-weight:800">${d.name}
          <span style="font-size:12px;color:var(--ink-mute);font-weight:600">${d.en}</span></span>
        <span style="font-size:15px;font-weight:900;color:var(--blue-700)">${v} 分 · ${tagOf(v)}</span>
      </div>
      <div class="bar-track"><div class="bar-fill" style="width:0%" data-w="${v}"></div></div>
    </div>`;
  }).join('');
  setTimeout(() => {
    document.querySelectorAll('.bar-fill').forEach(b => { b.style.width = b.dataset.w + '%'; });
  }, 120);

  goPage('result-page');
  setTimeout(() => {
    renderRadar(scores);
    // 写入分享链接参数
    const payload = btoa(JSON.stringify({ c: code, s: scores, t: primary }));
    history.replaceState(null, '', '#r=' + payload);
  }, 200);
}

function renderRadar(scores) {
  const ctx = $('radar-chart');
  if (!ctx || typeof Chart === 'undefined') return;
  if (radarChart) radarChart.destroy();
  radarChart = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: DIMENSIONS.map(d => d.name),
      datasets: [{
        label: '你的天赋画像',
        data: DIMENSIONS.map(d => scores[d.key]),
        backgroundColor: 'rgba(37, 99, 235, 0.20)',
        borderColor: '#1d4ed8',
        borderWidth: 3,
        pointBackgroundColor: '#1d4ed8',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 7,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: c => {
              const d = DIMENSIONS[c.dataIndex];
              return ` ${d.name}：${c.raw} 分 — ${d.desc}`;
            },
          },
        },
      },
      scales: {
        r: {
          min: 0, max: 100,
          ticks: { stepSize: 25, backdropColor: 'transparent', color: '#7d8aa3', font: { size: 10 } },
          pointLabels: { color: '#16233d', font: { size: 14, weight: '700' } },
          grid: { color: '#dbe7fb' },
          angleLines: { color: '#dbe7fb' },
        },
      },
    },
  });
}

/* ---------------- 保存长图 / 分享 ---------------- */
async function saveResultImage() {
  const btn = $('save-btn');
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = '生成中…';
  showToast('正在生成长图，请稍候…', 4000);

  document.querySelectorAll('.shot-hide').forEach(el => el.classList.add('hide'));

  try {
    const target = $('result-card');
    const canvas = await html2canvas(target, {
      backgroundColor: '#f2f7ff',
      scale: Math.min(2, window.devicePixelRatio + 1),
      useCORS: true,
      logging: false,
      windowWidth: target.scrollWidth,
    });
    const blob = await new Promise(r => canvas.toBlob(r, 'image/png', 0.95));
    const file = new File([blob], `天赋职业测评-${$('r-name').textContent}.png`, { type: 'image/png' });

    // 优先尝试 Web Share API（手机端可直接存相册）
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: '我的天赋职业画像' });
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      showToast('长图已保存，去相册/下载查看');
    }
  } catch (e) {
    showToast('生成失败，请截图保存');
  } finally {
    document.querySelectorAll('.shot-hide').forEach(el => el.classList.remove('hide'));
    btn.disabled = false;
    btn.textContent = original;
  }
}

async function copyShareLink() {
  const hash = location.hash.startsWith('#r=') ? location.hash : '';
  const url = location.origin + location.pathname + hash;
  try {
    await navigator.clipboard.writeText(url);
    showToast('结果链接已复制，发给朋友就能看');
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = url;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    showToast('结果链接已复制');
  }
}

/* ---------------- 分享链接还原 ---------------- */
function loadFromHash() {
  if (!location.hash.startsWith('#r=')) return false;
  try {
    const data = JSON.parse(atob(location.hash.slice(3)));
    if (!data || !data.s) return false;
    const scores = {};
    DIM_KEYS.forEach((k, i) => { scores[k] = data.s[k] !== undefined ? data.s[k] : 50; });
    showResultWithScores(scores, data.c || [data.t], data.t);
    return true;
  } catch (e) { return false; }
}

function showResultWithScores(scores, code, primary) {
  const t = ALL_TYPES[primary];
  if (!t) return false;
  // 复用 showResult 的渲染，但跳过答题
  const fakeShow = () => {
    $('r-emoji').textContent = t.emoji;
    $('r-name').textContent = t.name;
    $('r-tag').textContent = t.tag;
    $('r-code').textContent = code.join('-');
    $('r-rarity').textContent = t.rarity;
    $('r-whoami').textContent = t.whoami;

    $('r-signals').innerHTML = t.signals.map(s => `
      <div style="display:flex;gap:12px;margin-bottom:14px">
        <span style="color:#2563eb;font-size:18px;line-height:1.6">✦</span>
        <span style="font-size:16px;line-height:1.75;color:var(--ink-soft)">${s}</span>
      </div>`).join('');
    $('r-adv').innerHTML = t.advantages.map(s => `
      <div style="display:flex;gap:12px;margin-bottom:14px">
        <span style="color:#2563eb;font-weight:900">✔</span>
        <span style="font-size:16px;line-height:1.75;color:var(--ink-soft)">${s}</span>
      </div>`).join('');
    $('r-traps').innerHTML = t.traps.map(s => `
      <div style="display:flex;gap:12px;margin-bottom:14px">
        <span style="color:#b45309;font-weight:900">⚠</span>
        <span style="font-size:16px;line-height:1.75;color:var(--ink-soft)">${s}</span>
      </div>`).join('');
    $('r-careers').innerHTML = t.careers.map(c => `
      <div style="padding:16px 0;border-bottom:1px dashed var(--line)">
        <div style="font-size:17px;font-weight:900;color:var(--blue-800);margin-bottom:8px">${c.label}</div>
        <div style="font-size:15px;color:var(--ink-soft);line-height:1.8">${c.roles}</div>
      </div>`).join('');
    $('r-salary').innerHTML = t.salary.map(s => `
      <div style="display:flex;justify-content:space-between;gap:14px;padding:13px 0;border-bottom:1px dashed var(--line)">
        <span style="font-size:15px;color:var(--ink-soft);flex:1">${s.stage}</span>
        <b style="font-size:15px;color:var(--blue-700);text-align:right;flex:1.1">${s.range}</b>
      </div>`).join('');
    $('r-path').innerHTML = t.path.map(p => `
      <div style="display:flex;gap:14px;margin-bottom:16px">
        <div style="min-width:70px;height:32px;border-radius:10px;background:linear-gradient(135deg,#3b82f6,#1d4ed8);
          color:#fff;font-size:14px;font-weight:900;display:flex;align-items:center;justify-content:center">${p.stage}</div>
        <div style="font-size:16px;line-height:1.8;color:var(--ink-soft);flex:1">${p.do}</div>
      </div>`).join('');
    $('r-pitfalls').innerHTML = t.pitfalls.map((p, i) => `
      <div style="display:flex;gap:12px;margin-bottom:14px">
        <span style="min-width:24px;height:24px;border-radius:8px;background:#fef3c7;color:#b45309;
          font-size:13px;font-weight:900;display:flex;align-items:center;justify-content:center">${i + 1}</span>
        <span style="font-size:16px;line-height:1.75;color:var(--ink-soft)">${p}</span>
      </div>`).join('');
    $('r-actions').innerHTML = t.actions.map((a, i) => `
      <div style="display:flex;gap:12px;margin-bottom:16px">
        <span style="min-width:26px;height:26px;border-radius:50%;background:#1d4ed8;color:#fff;
          font-size:14px;font-weight:900;display:flex;align-items:center;justify-content:center">${i + 1}</span>
        <span style="font-size:16px;line-height:1.75;color:var(--ink);flex:1">${a}</span>
      </div>`).join('');
    $('r-envfit').textContent = t.envFit;
    $('r-envunfit').textContent = t.envUnfit;
    $('r-partner').textContent = t.partner;

    const tagOf = v => v >= 80 ? '非常突出' : v >= 60 ? '明显优势' : v >= 45 ? '中等' : v >= 30 ? '偏弱' : '待发展';
    $('r-bars').innerHTML = DIMENSIONS.map(d => {
      const v = scores[d.key];
      return `
      <div style="margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:7px">
          <span style="font-size:16px;font-weight:800">${d.name}</span>
          <span style="font-size:15px;font-weight:900;color:var(--blue-700)">${v} 分 · ${tagOf(v)}</span>
        </div>
        <div class="bar-track"><div class="bar-fill" style="width:${v}%"></div></div>
      </div>`;
    }).join('');

    const avg3 = (scores[code[0]] + scores[code[1]] + scores[code[2]]) / 3;
    $('r-score').textContent = Math.max(55, Math.min(98, Math.round(avg3 * 0.7 + scores[primary] * 0.3)));

    goPage('result-page');
    setTimeout(() => renderRadar(scores), 200);
  };
  fakeShow();
  return true;
}

/* ---------------- 事件绑定 ---------------- */
$('start-btn').addEventListener('click', checkPassword);
$('key-input').addEventListener('keydown', e => { if (e.key === 'Enter') checkPassword(); });
$('key-input').addEventListener('input', e => {
  let v = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
  e.target.value = v;
});
$('next-btn').addEventListener('click', nextQuestion);
$('prev-btn').addEventListener('click', prevQuestion);
$('save-btn').addEventListener('click', saveResultImage);
$('share-btn').addEventListener('click', copyShareLink);
$('retry-btn').addEventListener('click', () => { goPage('login-page'); $('key-input').value = ''; });
$('review-btn').addEventListener('click', () => $('review-modal').classList.add('show'));
$('review-close').addEventListener('click', () => $('review-modal').classList.remove('show'));
$('review-modal').addEventListener('click', e => {
  if (e.target === $('review-modal')) $('review-modal').classList.remove('show');
});

// 支持键盘 1-5 选择
document.addEventListener('keydown', e => {
  if (!$('quiz-page').classList.contains('active')) return;
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= 5) selectOption(n);
});

// 初始化
window.addEventListener('DOMContentLoaded', () => {
  if (!loadFromHash()) goPage('login-page');
});
