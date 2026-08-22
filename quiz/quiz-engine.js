/**
 * 研修クイズ 共通エンジン ver002
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

// 肉球マスコット（LINEアイコンと同じネイビー×オレンジ）
const PAW_SVG = `
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="肉球マスコット">
  <circle cx="50" cy="50" r="50" fill="var(--brand-navy)"/>
  <g fill="var(--orange)">
    <ellipse cx="50" cy="61" rx="20.5" ry="16.5"/>
    <circle cx="32" cy="40" r="8.2"/>
    <circle cx="50" cy="34" r="8.8"/>
    <circle cx="68" cy="40" r="8.2"/>
  </g>
</svg>`;

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
      <p>お名前を入力してから始めましょう</p>
      <input type="text" id="nameInput" placeholder="例：山田太郎">
      <br>
      <button class="btn-primary" id="startBtn">クイズをはじめる</button>
    </div>

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
      </div>
      <div id="resultDetail"></div>
      <div class="retry-link"><a href="javascript:location.reload()">もう一度挑戦する</a></div>
    </div>
  `;

  const nameScreen = document.getElementById('nameScreen');
  const quizEl = document.getElementById('quiz');
  const progressTrack = document.getElementById('progressTrack');
  const submitBtnWrap = document.getElementById('submitBtnWrap');
  const submitBtn = document.getElementById('submitBtn');
  const resultScreen = document.getElementById('resultScreen');

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

  // --- ① 名前入力 → クイズ表示 ---
  document.getElementById('startBtn').onclick = () => {
    const v = document.getElementById('nameInput').value.trim();
    if (!v) { alert('お名前を入力してください'); return; }
    userName = v;
    nameScreen.style.display = 'none';
    progressTrack.style.display = 'flex';
    quizEl.style.display = 'block';
    submitBtnWrap.style.display = 'block';
    renderQuiz();
  };

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

    quizEl.style.display = 'none';
    progressTrack.style.display = 'none';
    submitBtnWrap.style.display = 'none';
    resultScreen.style.display = 'block';
    window.scrollTo(0, 0);

    markCleared(config.quiz_id || config.video_title);
    sendResult(config, questions, selected, userName, score);
  };
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
function sendResult(config, questions, selected, userName, score) {
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
    動画タイトル: config.video_title,
    受講日時: new Date().toISOString(),
    正答数: score,
    総問題数: questions.length,
    回答詳細: detailText
  };

  fetch(QUIZ_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    // 結果表示直後に「もう一度挑戦する」等でページ離脱しても送信が中断されないようにする
    keepalive: true
  }).then(res => {
    if (!res.ok) throw new Error('status ' + res.status);
    console.log('[研修クイズ] 送信OK', payload);
  }).catch(err => {
    console.error('[研修クイズ] 送信失敗:', err.message, payload);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : str;
  return div.innerHTML;
}
