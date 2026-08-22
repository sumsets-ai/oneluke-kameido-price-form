/**
 * 研修クイズ 共通エンジン ver003
 *
 * 使い方（各クイズHTML側）:
 *   <div id="app"></div>
 *   <script src="quiz-engine.js"></script>
 *   <script>
 *     initQuiz({
 *       video_title: "抱っこの仕方",
 *       category: "犬の扱い方",
 *       source_url: "https://one-stream.io/...",
 *       questions: [ { q, choices, answer, explanation }, ... ]
 *     });
 *   </script>
 *
 * このファイルを直接編集すれば、全クイズに一括で反映される。
 * 新しいクイズを増やすときはこのファイルは触らず、questionsデータだけ増やせばいい。
 */

// ============================================================
// 送信先（Make Webhook URL）と合言葉。全クイズ共通。
// ============================================================
const QUIZ_WEBHOOK_URL = "https://hook.us2.make.com/yffxvvnnq7vwu2b1pbeju5966gw1nqjw";
const QUIZ_SHARED_SECRET = "oneluke-quiz-2026";

// 肉球マスコット（お店のブランドカラー：ティファニーブルー×白）
const PAW_SVG = `
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="肉球マスコット">
  <circle cx="50" cy="50" r="50" fill="var(--brand-tiffany)"/>
  <g fill="#ffffff">
    <ellipse cx="50" cy="61" rx="20.5" ry="16.5"/>
    <circle cx="32" cy="40" r="8.2"/>
    <circle cx="50" cy="34" r="8.8"/>
    <circle cx="68" cy="40" r="8.2"/>
  </g>
</svg>`;

// ============================================================
// 学習継続の仕組み（連続記録・ポイント・週間ログ）
// すべてこの端末のlocalStorageに保存する（他の端末とは共有されない）。
// ============================================================
const STATS_KEYS = {
  xp: 'quizXP',
  streak: 'quizStreakCount',
  lastActive: 'quizLastActiveDate',
  activityDates: 'quizActivityDates'
};

function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function daysBetween(a, b) {
  const d1 = new Date(a + 'T00:00:00');
  const d2 = new Date(b + 'T00:00:00');
  return Math.round((d2 - d1) / 86400000);
}

function getXP() {
  try { return parseInt(localStorage.getItem(STATS_KEYS.xp) || '0', 10) || 0; } catch (e) { return 0; }
}
function addXP(amount) {
  try { localStorage.setItem(STATS_KEYS.xp, String(getXP() + amount)); } catch (e) {}
}
function getStreak() {
  try { return parseInt(localStorage.getItem(STATS_KEYS.streak) || '0', 10) || 0; } catch (e) { return 0; }
}
function getActivityDates() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STATS_KEYS.activityDates) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

// クイズを1本完了した時に呼ぶ。ストリーク更新・週間ログ追加・XP付与をまとめて行い、
// 新しいストリーク日数と獲得XPを返す。
function recordCompletion(score, total) {
  const today = todayStr();
  let last = null;
  try { last = localStorage.getItem(STATS_KEYS.lastActive); } catch (e) {}

  let streak = getStreak();
  if (last === today) {
    // 今日はもう記録済み（連続記録はそのまま）
  } else if (last && daysBetween(last, today) === 1) {
    streak += 1;
  } else {
    streak = 1;
  }

  try {
    localStorage.setItem(STATS_KEYS.streak, String(streak));
    localStorage.setItem(STATS_KEYS.lastActive, today);
    const dates = getActivityDates();
    if (!dates.includes(today)) {
      dates.push(today);
      localStorage.setItem(STATS_KEYS.activityDates, JSON.stringify(dates));
    }
  } catch (e) {}

  const gained = score === total ? 20 : 10;
  addXP(gained);

  return { streak, xp: getXP(), gained };
}

// 今週（日曜始まり）にクイズをやった曜日の一覧を返す（一覧ページの週間カレンダー用）
function getWeekProgress() {
  const dates = new Set(getActivityDates());
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=日曜
  const labels = ['日', '月', '火', '水', '木', '金', '土'];
  const result = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - dayOfWeek + i);
    const s = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    result.push({ label: labels[i], done: dates.has(s), isToday: i === dayOfWeek });
  }
  return result;
}

// ページ上部の固定ステータスバー（🔥連続記録・⭐ポイント）を描画する。
// クイズ一覧ページ・クイズページの両方から呼べる共通関数。
function renderStatusBar(container) {
  if (!container) return;
  // position:stickyな要素は「親要素の高さの範囲内」でしか固定されない。
  // 専用の入れ物divで包むと、その入れ物自体の高さが低いためすぐ画面外に流れてしまうので、
  // 渡されたcontainer自体にクラスを付けて、大きい親（#app）の直接の子として固定させる。
  container.className = 'status-bar';
  container.innerHTML = `
    <div class="status-chip">🔥<span>${getStreak()}</span>日</div>
    <div class="status-chip">⭐<span>${getXP()}</span>pt</div>
  `;
}

// 週間カレンダーを描画する（クイズ一覧ページ用）
function renderWeekCalendar(container) {
  if (!container) return;
  const week = getWeekProgress();
  container.innerHTML = `
    <div class="week-cal">
      ${week.map(d => `
        <div class="week-day">
          <div class="week-day-label${d.isToday ? ' today' : ''}">${d.label}</div>
          <div class="week-day-dot${d.done ? ' done' : ''}"></div>
        </div>
      `).join('')}
    </div>
  `;
}

// ============================================================
// 受講者プロフィール（所属店舗・氏名）
// 一度入力すればこの端末に保存され、次回以降は入力画面を出さずに直接クイズへ進む。
// ============================================================
const PROFILE_KEYS = { name: 'quizUserName', store: 'quizUserStore' };

function getProfile() {
  try {
    return {
      name: localStorage.getItem(PROFILE_KEYS.name) || '',
      store: localStorage.getItem(PROFILE_KEYS.store) || ''
    };
  } catch (e) {
    return { name: '', store: '' };
  }
}
function saveProfile(name, store) {
  try {
    localStorage.setItem(PROFILE_KEYS.name, name);
    localStorage.setItem(PROFILE_KEYS.store, store);
  } catch (e) {}
}
function clearProfile() {
  try {
    localStorage.removeItem(PROFILE_KEYS.name);
    localStorage.removeItem(PROFILE_KEYS.store);
  } catch (e) {}
}

// 満点時の吹き出しメッセージ（ランダム）
const PERFECT_MESSAGES = [
  "満点！お店の看板を任せられそうです🐾",
  "パーフェクト！次のシフトでも頼りにしてます",
  "全問正解、さすがです！この調子で次のクイズも",
];
const GOOD_MESSAGES = [
  "あと少し！間違えた問題だけ動画で見直してみましょう",
  "いい感じです。もう一度動画を確認して満点を狙いましょう",
];

function initQuiz(config) {
  const questions = config.questions;
  const selected = new Array(questions.length).fill(null);
  let userName = "";

  const app = document.getElementById('app');
  app.innerHTML = `
    <div id="statusBarMount"></div>

    <div class="brand-row">
      <div class="paw-mark">${PAW_SVG}</div>
      <h1>研修クイズ：${escapeHtml(config.video_title)}</h1>
    </div>
    <div class="sub">${escapeHtml(config.category || '')}</div>
    <div class="video-info">
      対象動画：<a href="${escapeHtml(config.source_url)}" target="_blank">「${escapeHtml(config.video_title)}」</a><br>
      動画をしっかり見てから挑戦してください。
    </div>

    <div id="nameScreen">
      <div class="mascot-big">${PAW_SVG}</div>
      <p>最初に登録しましょう（次回から入力不要になります）</p>
      <input type="text" id="storeInput" placeholder="所属店舗名（例：ワンルーク亀戸店）">
      <input type="text" id="nameInput" placeholder="お名前（フルネーム）">
      <br>
      <button class="btn-primary" id="startBtn">クイズをはじめる</button>
    </div>

    <div id="profileBar" style="display:none;"></div>

    <div id="progressTrack" class="progress-track" style="display:none;"></div>
    <div id="quiz" style="display:none;"></div>
    <div id="submitBtnWrap" style="display:none;">
      <button class="btn-primary" id="submitBtn" disabled>採点する（全問回答してください）</button>
    </div>

    <div id="resultScreen">
      <div class="score-card" id="scoreCard">
        <div class="mascot-big">${PAW_SVG}</div>
        <div class="score-name" id="resultName"></div>
        <div class="score-num" id="resultScore"></div>
        <div class="score-label">正解</div>
        <div class="score-msg" id="resultMsg"></div>
        <div class="xp-gain" id="xpGain"></div>
      </div>
      <div id="reviewCta" class="review-cta" style="display:none;">
        <button class="btn-primary" id="reviewBtn">苦手な問題だけもう一度</button>
      </div>
      <div id="resultDetail"></div>
      <div class="retry-link"><a href="javascript:location.reload()">もう一度挑戦する</a></div>
    </div>

    <div id="reviewScreen">
      <div class="brand-row" style="margin-bottom:14px;">
        <div class="paw-mark">${PAW_SVG}</div>
        <h1 style="font-size:18px;">苦手な問題を復習</h1>
      </div>
      <div id="reviewQuiz"></div>
      <div id="reviewDone" class="review-done" style="display:none;">
        <p>おつかれさまでした！🐾<br>動画をもう一度見て、次は満点を狙いましょう。</p>
      </div>
      <div class="retry-link"><a href="#" id="backToResultLink">結果画面にもどる</a></div>
    </div>
  `;

  renderStatusBar(document.getElementById('statusBarMount'));

  const nameScreen = document.getElementById('nameScreen');
  const profileBar = document.getElementById('profileBar');
  const quizEl = document.getElementById('quiz');
  const progressTrack = document.getElementById('progressTrack');
  const submitBtnWrap = document.getElementById('submitBtnWrap');
  const submitBtn = document.getElementById('submitBtn');
  const resultScreen = document.getElementById('resultScreen');
  const reviewScreen = document.getElementById('reviewScreen');
  let userStore = "";

  // --- 進捗バーの初期描画 ---
  questions.forEach(() => {
    const dot = document.createElement('div');
    dot.className = 'progress-dot';
    progressTrack.appendChild(dot);
  });

  function updateProgress() {
    const dots = progressTrack.querySelectorAll('.progress-dot');
    dots.forEach((dot, i) => {
      dot.classList.toggle('done', selected[i] !== null);
    });
  }

  // --- ① 登録済みプロフィールがあれば、名前入力をスキップして直接クイズへ ---
  const savedProfile = getProfile();
  if (savedProfile.name) {
    userName = savedProfile.name;
    userStore = savedProfile.store;
    nameScreen.style.display = 'none';
    showProfileBar();
    beginQuiz();
  } else {
    document.getElementById('startBtn').onclick = () => {
      const nameVal = document.getElementById('nameInput').value.trim();
      const storeVal = document.getElementById('storeInput').value.trim();
      if (!nameVal) { alert('お名前を入力してください'); return; }
      userName = nameVal;
      userStore = storeVal;
      saveProfile(userName, userStore);
      nameScreen.style.display = 'none';
      showProfileBar();
      beginQuiz();
    };
  }

  function showProfileBar() {
    profileBar.style.display = 'block';
    profileBar.innerHTML = `
      <div class="video-info" style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
        <span>${escapeHtml(userName)}さんとして挑戦中${userStore ? '（' + escapeHtml(userStore) + '）' : ''}</span>
        <a href="#" id="switchUserLink" style="color:var(--tiffany-deep); font-weight:600; white-space:nowrap;">別の人はこちら</a>
      </div>
    `;
    document.getElementById('switchUserLink').onclick = (e) => {
      e.preventDefault();
      clearProfile();
      location.reload();
    };
  }

  function beginQuiz() {
    progressTrack.style.display = 'flex';
    quizEl.style.display = 'block';
    submitBtnWrap.style.display = 'block';
    renderQuiz();
  }

  // --- ② クイズ描画（選択のみ、正誤はまだ出さない） ---
  function renderQuiz() {
    questions.forEach((item, qi) => {
      const qDiv = document.createElement('div');
      qDiv.className = 'q';

      const eyebrow = document.createElement('div');
      eyebrow.className = 'q-eyebrow';
      eyebrow.textContent = `Q${qi + 1} / ${questions.length}`;
      qDiv.appendChild(eyebrow);

      const title = document.createElement('div');
      title.className = 'q-title';
      title.textContent = item.q;
      qDiv.appendChild(title);

      item.choices.forEach((choiceText, ci) => {
        const btn = document.createElement('button');
        btn.className = 'choice';
        btn.textContent = choiceText;
        btn.onclick = () => {
          selected[qi] = ci;
          qDiv.querySelectorAll('.choice').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          updateProgress();
          checkAllAnswered();
        };
        qDiv.appendChild(btn);
      });

      quizEl.appendChild(qDiv);
    });
  }

  function checkAllAnswered() {
    const allAnswered = selected.every(s => s !== null);
    submitBtn.disabled = !allAnswered;
    submitBtn.textContent = allAnswered
      ? '採点する'
      : `採点する（あと${selected.filter(s => s === null).length}問）`;
  }

  // --- ③ 採点 → 結果画面表示 + 送信 ---
  submitBtn.onclick = () => {
    let score = 0;
    const detailEl = document.getElementById('resultDetail');
    detailEl.innerHTML = '';

    questions.forEach((item, qi) => {
      const isCorrect = selected[qi] === item.answer;
      if (isCorrect) score++;

      const qDiv = document.createElement('div');
      qDiv.className = 'q';

      const eyebrow = document.createElement('div');
      eyebrow.className = 'q-eyebrow';
      eyebrow.textContent = `Q${qi + 1}　${isCorrect ? '⭕️ 正解' : '❌ 不正解'}`;
      qDiv.appendChild(eyebrow);

      const title = document.createElement('div');
      title.className = 'q-title';
      title.textContent = item.q;
      qDiv.appendChild(title);

      item.choices.forEach((choiceText, ci) => {
        const div = document.createElement('div');
        div.className = 'choice';
        div.textContent = choiceText + (ci === selected[qi] ? '（あなたの回答）' : '');
        if (ci === item.answer) div.classList.add('correct');
        else if (ci === selected[qi]) div.classList.add('wrong');
        qDiv.appendChild(div);
      });

      const exp = document.createElement('div');
      exp.className = 'explanation';
      exp.style.display = 'block';
      exp.textContent = item.explanation;
      qDiv.appendChild(exp);

      detailEl.appendChild(qDiv);
    });

    const isPerfect = score === questions.length;
    document.getElementById('resultName').textContent = `${userName} さん`;
    document.getElementById('resultScore').textContent = `${score} / ${questions.length}`;
    document.getElementById('scoreCard').classList.toggle('perfect', isPerfect);
    document.getElementById('resultMsg').textContent = isPerfect
      ? pickRandom(PERFECT_MESSAGES)
      : pickRandom(GOOD_MESSAGES);

    // ストリーク・ポイントを更新し、獲得ポイントを表示。ヘッダーのステータスバーも更新する。
    const stats = recordCompletion(score, questions.length);
    document.getElementById('xpGain').textContent = `+${stats.gained}pt 獲得！（累計${stats.xp}pt・連続${stats.streak}日）`;
    renderStatusBar(document.getElementById('statusBarMount'));

    // 満点でなければ「苦手な問題だけもう一度」を出す
    const reviewCta = document.getElementById('reviewCta');
    if (!isPerfect) {
      reviewCta.style.display = 'block';
      document.getElementById('reviewBtn').onclick = () => startReview();
    } else {
      reviewCta.style.display = 'none';
    }

    quizEl.style.display = 'none';
    progressTrack.style.display = 'none';
    submitBtnWrap.style.display = 'none';
    resultScreen.style.display = 'block';
    window.scrollTo(0, 0);

    markCleared(config.quiz_id || config.video_title);
    sendResult(config, questions, selected, userName, userStore, score);
  };

  // --- ④ 苦手な問題だけの復習（Airtableへの再送信はしない、その場の練習用） ---
  function startReview() {
    const wrongQuestions = questions.filter((item, qi) => selected[qi] !== item.answer);
    const reviewQuizEl = document.getElementById('reviewQuiz');
    const reviewDone = document.getElementById('reviewDone');
    reviewQuizEl.innerHTML = '';
    reviewDone.style.display = 'none';

    let doneCount = 0;

    wrongQuestions.forEach((item, qi) => {
      const qDiv = document.createElement('div');
      qDiv.className = 'q';

      const eyebrow = document.createElement('div');
      eyebrow.className = 'q-eyebrow';
      eyebrow.textContent = `復習 ${qi + 1} / ${wrongQuestions.length}`;
      qDiv.appendChild(eyebrow);

      const title = document.createElement('div');
      title.className = 'q-title';
      title.textContent = item.q;
      qDiv.appendChild(title);

      let answered = false;
      item.choices.forEach((choiceText, ci) => {
        const btn = document.createElement('button');
        btn.className = 'choice';
        btn.textContent = choiceText;
        btn.onclick = () => {
          if (answered) return;
          answered = true;
          doneCount++;
          qDiv.querySelectorAll('.choice').forEach((b, bi) => {
            if (bi === item.answer) b.classList.add('correct');
            else if (bi === ci) b.classList.add('wrong');
          });
          exp.style.display = 'block';
          if (doneCount === wrongQuestions.length) {
            reviewDone.style.display = 'block';
          }
        };
        qDiv.appendChild(btn);
      });

      const exp = document.createElement('div');
      exp.className = 'explanation';
      exp.textContent = item.explanation;
      qDiv.appendChild(exp);

      reviewQuizEl.appendChild(qDiv);
    });

    resultScreen.style.display = 'none';
    reviewScreen.style.display = 'block';
    window.scrollTo(0, 0);

    // 「結果画面にもどる」：ページを再読み込みせず、既に描画済みの結果画面をそのまま出し直す
    document.getElementById('backToResultLink').onclick = (e) => {
      e.preventDefault();
      reviewScreen.style.display = 'none';
      resultScreen.style.display = 'block';
      window.scrollTo(0, 0);
    };
  }
}

// --- 一覧ページの「Clear」スタンプ用（この端末のブラウザに記録） ---
// quiz_id はファイル名（拡張子なし）を使う。クイズ一覧.html側のファイル名と必ず一致させること。
function markCleared(quizId) {
  try {
    localStorage.setItem('quizCleared:' + quizId, '1');
  } catch (e) {
    // localStorageが使えない環境では何もしない（挑戦自体は問題なく完了する）
  }
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// --- 回答結果の送信（Airtable連携用） ---
// 画面には状態を表示しない。送信の成否はブラウザの開発者ツール（コンソール）にのみ記録する。
function sendResult(config, questions, selected, userName, userStore, score) {
  const detailText = questions.map((item, qi) => {
    const isCorrect = selected[qi] === item.answer;
    return `Q${qi + 1}. ${item.q}\n`
      + `回答: ${item.choices[selected[qi]]}（${isCorrect ? '正解' : '不正解'}）\n`
      + `正解: ${item.choices[item.answer]}`;
  }).join('\n\n');

  const payload = {
    合言葉: QUIZ_SHARED_SECRET,
    送信ID: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()),
    受講者名: userName,
    所属店舗: userStore,
    動画タイトル: config.video_title,
    受講日時: new Date().toISOString(),
    正答数: score,
    総問題数: questions.length,
    回答詳細: detailText
  };

  // 送信を試みる前に、まず再送キューへ保存しておく。
  // （送信中・リトライ待機中にページを閉じても、キューに残っていれば次回開いた時に再送できる）
  queuePending(payload);
  postToWebhook(payload);
}

// --- 送信の実行＋失敗時の再送キュー ---
// 一時的な通信障害で受講記録が消えないよう、失敗した回答はlocalStorageに残し、
// 次に別のクイズページを開いたタイミングで自動的に再送を試みる。
const PENDING_KEY = 'quizPendingSubmissions';

// 送信失敗時、その場で3回まで自動リトライ（1.5秒→3秒間隔）する。
// payloadは呼び出し元（sendResult/flushPendingSubmissions）で送信前に既にキューへ保存済みなので、
// ここでは「成功したらキューから消す」だけでよい（送信中・リトライ待機中にページを閉じても記録は残る）。
function postToWebhook(payload, attempt) {
  attempt = attempt || 1;
  fetch(QUIZ_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    // 結果表示直後に「もう一度挑戦する」等でページ離脱しても送信が中断されないようにする
    keepalive: true
  }).then(res => {
    if (!res.ok) throw new Error('status ' + res.status);
    console.log('[研修クイズ] 送信OK', payload);
    removeFromPending(payload.送信ID);
  }).catch(err => {
    if (attempt < 3) {
      console.warn(`[研修クイズ] 送信失敗（${attempt}回目）。再試行します:`, err.message);
      setTimeout(() => postToWebhook(payload, attempt + 1), attempt * 1500);
    } else {
      console.error('[研修クイズ] 送信失敗（3回試行）。再送キューに残したままにします:', err.message, payload);
    }
  });
}

function readPendingList() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PENDING_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

// 送信IDで重複を避けつつキューに積む（既にキューにある場合は上書き）
function queuePending(payload) {
  try {
    const list = readPendingList().filter(p => p && p.送信ID !== payload.送信ID);
    list.push(payload);
    localStorage.setItem(PENDING_KEY, JSON.stringify(list));
  } catch (e) {
    // localStorageが使えない環境では再送キューも諦める（それ以上は打つ手がない）
  }
}

function removeFromPending(sendId) {
  try {
    const list = readPendingList().filter(p => p && p.送信ID !== sendId);
    localStorage.setItem(PENDING_KEY, JSON.stringify(list));
  } catch (e) {}
}

// ページ読み込み時に、前回以前に送信できなかった分があれば自動で再送を試みる。
// 送信が確定するまでキューからは消さないので、再試行中にページを閉じても記録は残る。
function flushPendingSubmissions() {
  const list = readPendingList();
  if (!list.length) return;
  list.forEach(payload => postToWebhook(payload));
}
flushPendingSubmissions();

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : str;
  return div.innerHTML;
}
