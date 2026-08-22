/**
 * 研修クイズ 共通エンジン
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

function initQuiz(config) {
  const questions = config.questions;
  const selected = new Array(questions.length).fill(null);
  let userName = "";

  const app = document.getElementById('app');
  app.innerHTML = `
    <h1>研修クイズ：${escapeHtml(config.video_title)}</h1>
    <div class="sub">${escapeHtml(config.category || '')}</div>
    <div class="video-info">
      対象動画：<a href="${escapeHtml(config.source_url)}" target="_blank">「${escapeHtml(config.video_title)}」</a><br>
      動画をしっかり見てから挑戦してください。
    </div>

    <div id="nameScreen">
      <p>お名前を入力してから始めてください</p>
      <input type="text" id="nameInput" placeholder="例：山田太郎">
      <br>
      <button class="btn-primary" id="startBtn">クイズをはじめる</button>
    </div>

    <div id="quiz" style="display:none;"></div>
    <div id="submitBtnWrap" style="display:none;">
      <button class="btn-primary" id="submitBtn" disabled>採点する（全問回答してください）</button>
    </div>

    <div id="resultScreen">
      <div class="score-card">
        <div class="score-name" id="resultName"></div>
        <div class="score-num" id="resultScore"></div>
        <div class="score-name">正解</div>
      </div>
      <div id="resultDetail"></div>
      <div class="retry-link"><a href="javascript:location.reload()">もう一度挑戦する</a></div>
    </div>
  `;

  const nameScreen = document.getElementById('nameScreen');
  const quizEl = document.getElementById('quiz');
  const submitBtnWrap = document.getElementById('submitBtnWrap');
  const submitBtn = document.getElementById('submitBtn');
  const resultScreen = document.getElementById('resultScreen');

  // --- ① 名前入力 → クイズ表示 ---
  document.getElementById('startBtn').onclick = () => {
    const v = document.getElementById('nameInput').value.trim();
    if (!v) { alert('お名前を入力してください'); return; }
    userName = v;
    nameScreen.style.display = 'none';
    quizEl.style.display = 'block';
    submitBtnWrap.style.display = 'block';
    renderQuiz();
  };

  // --- ② クイズ描画（選択のみ、正誤はまだ出さない） ---
  function renderQuiz() {
    questions.forEach((item, qi) => {
      const qDiv = document.createElement('div');
      qDiv.className = 'q';
      const title = document.createElement('div');
      title.className = 'q-title';
      title.textContent = `Q${qi + 1}. ${item.q}`;
      qDiv.appendChild(title);

      item.choices.forEach((choiceText, ci) => {
        const btn = document.createElement('button');
        btn.className = 'choice';
        btn.textContent = choiceText;
        btn.onclick = () => {
          selected[qi] = ci;
          qDiv.querySelectorAll('.choice').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
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
      const title = document.createElement('div');
      title.className = 'q-title';
      title.textContent = `Q${qi + 1}. ${item.q}　${isCorrect ? '⭕️' : '❌'}`;
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

    document.getElementById('resultName').textContent = `${userName} さん`;
    document.getElementById('resultScore').textContent = `${score} / ${questions.length}`;

    quizEl.style.display = 'none';
    submitBtnWrap.style.display = 'none';
    resultScreen.style.display = 'block';
    window.scrollTo(0, 0);

    sendResult(config, questions, selected, userName, score);
  };
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
    body: JSON.stringify(payload)
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
