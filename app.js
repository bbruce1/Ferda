// ============================================================
// APP LOGIC — Batch-of-3 quiz system
// ============================================================

const PASSWORD = "baghuckers";
const BATCH_SIZE = 3;

// ── Helpers ──────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function showScreen(id) {
  $$('.screen').forEach(s => s.classList.remove('active'));
  $(`#${id}`).classList.add('active');
}

const FIELD_LABELS = {
  page: "Page #",
  yearMajor: "Year / Major",
  hometown: "Hometown",
  position: "Position",
  bigBrother: "Big Brother",
  littleBrother: "Little Brother",
  pledgeClass: "Pledge Class",
  extra: "Extra"
};

const BASE_FIELDS = ["page", "yearMajor", "hometown", "position", "bigBrother", "littleBrother", "pledgeClass"];

function getFieldsForPerson(person) {
  const all = [...BASE_FIELDS, "extra"];
  return all.filter(key => person[key] != null && String(person[key]).trim() !== "");
}

// ── Password ─────────────────────────────────────────────────
function initPassword() {
  const input = $('#pw-input');
  const btn = $('#pw-btn');
  const err = $('#pw-error');
  function tryLogin() {
    if (input.value.trim() === PASSWORD) {
      sessionStorage.setItem('authed', '1');
      showMenu();
    } else {
      err.textContent = "Wrong password. Try again.";
      input.value = '';
      input.focus();
    }
  }
  btn.addEventListener('click', tryLogin);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') tryLogin(); });
}

// ── Menu ─────────────────────────────────────────────────────
function showMenu() {
  showScreen('menu-screen');
  $('#page-count').textContent = `${PAGES.length} pages loaded`;
}

// ══════════════════════════════════════════════════════════════
// SHARED BATCH STATE
// ══════════════════════════════════════════════════════════════
let allPages = [];           // all pages shuffled once at start
let batchStart = 0;          // index into allPages where current batch begins
let currentBatch = [];       // the 3 (or fewer) pages in this batch
let batchRound = 0;          // how many times we've attempted this batch
let personIndex = 0;         // which person within the batch we're on
let batchMistakes = new Set(); // names of people we got wrong this round
let quizMode = '';           // 'match' or 'freewrite'
let totalScore = { correct: 0, wrong: 0 };

// Matching-specific
let matchFieldIndex = 0;
let matchFields = [];
let matchAnswered = {};
let matchLocked = false;
let personHadMistake = false; // did current person have any wrong answer

// ── Start a new batch ────────────────────────────────────────
function startBatch() {
  currentBatch = allPages.slice(batchStart, batchStart + BATCH_SIZE);
  if (currentBatch.length === 0) { showResults(); return; }
  batchRound = 0;
  startBatchRound();
}

function startBatchRound() {
  batchRound++;
  batchMistakes = new Set();
  personIndex = 0;
  // On first round, use the batch as-is; on repeats, shuffle order
  if (batchRound > 1) currentBatch = shuffle(currentBatch);
  startNextPersonInBatch();
}

function startNextPersonInBatch() {
  if (personIndex >= currentBatch.length) {
    // Finished everyone in this round — did we pass?
    if (batchMistakes.size === 0) {
      // Perfect round! Move to next batch
      batchStart += BATCH_SIZE;
      showBatchComplete();
    } else {
      // Had mistakes — repeat the batch
      showBatchRetry();
    }
    return;
  }
  if (quizMode === 'match') {
    beginMatchPerson();
  } else {
    renderFWQuestion();
  }
}

// ══════════════════════════════════════════════════════════════
// BATCH INTERSTITIALS
// ══════════════════════════════════════════════════════════════
function showBatchComplete() {
  const totalBatches = Math.ceil(allPages.length / BATCH_SIZE);
  const currentBatchNum = Math.min(Math.ceil(batchStart / BATCH_SIZE), totalBatches);

  if (batchStart >= allPages.length) {
    showResults();
    return;
  }

  showScreen('batch-screen');
  $('#batch-title').textContent = '✅ Batch Complete!';
  $('#batch-detail').textContent = `You got all ${currentBatch.length} pages perfect!`;
  $('#batch-progress-text').textContent = `${batchStart} of ${allPages.length} pages mastered`;
  const pct = (batchStart / allPages.length) * 100;
  $('#batch-bar').style.width = pct + '%';
  $('#batch-btn').textContent = 'Next Batch →';
  $('#batch-btn').onclick = () => startBatch();
}

function showBatchRetry() {
  showScreen('batch-screen');
  $('#batch-title').textContent = '🔄 Not quite!';
  $('#batch-detail').textContent = `Missed something on ${batchMistakes.size} page${batchMistakes.size > 1 ? 's' : ''}. Let's try this batch again.`;
  $('#batch-progress-text').textContent = `${batchStart} of ${allPages.length} pages mastered · Round ${batchRound}`;
  const pct = (batchStart / allPages.length) * 100;
  $('#batch-bar').style.width = pct + '%';
  $('#batch-btn').textContent = 'Retry Batch →';
  $('#batch-btn').onclick = () => startBatchRound();
}

function updateHeader(prefix) {
  const batchNum = Math.floor(batchStart / BATCH_SIZE) + 1;
  const totalBatches = Math.ceil(allPages.length / BATCH_SIZE);
  $(`#${prefix}-person-count`).textContent =
    `Batch ${batchNum}/${totalBatches} · Person ${personIndex + 1}/${currentBatch.length}` +
    (batchRound > 1 ? ` · Round ${batchRound}` : '');
  $(`#${prefix}-score`).innerHTML =
    `<span class="correct">${totalScore.correct}✓</span> · <span class="wrong">${totalScore.wrong}✗</span>`;
  const pct = allPages.length > 0 ? (batchStart / allPages.length) * 100 : 0;
  $(`#${prefix}-progress`).style.width = pct + '%';
}

// ══════════════════════════════════════════════════════════════
// MATCHING MODE
// ══════════════════════════════════════════════════════════════
function startMatching() {
  if (PAGES.length < 3) { alert("Need at least 3 pages for matching!"); return; }
  quizMode = 'match';
  allPages = shuffle([...PAGES]);
  batchStart = 0;
  totalScore = { correct: 0, wrong: 0 };
  showScreen('match-screen');
  startBatch();
}

function beginMatchPerson() {
  const person = currentBatch[personIndex];
  matchFields = getFieldsForPerson(person);
  matchFieldIndex = 0;
  matchAnswered = {};
  matchLocked = false;
  personHadMistake = false;
  showScreen('match-screen');
  renderMatchPage();
}

function renderMatchPage() {
  const person = currentBatch[personIndex];
  updateHeader('match');

  const card = $('#match-card-content');
  card.innerHTML = '';

  // Name
  const nameEl = document.createElement('div');
  nameEl.className = 'person-name';
  nameEl.textContent = person.name;
  card.appendChild(nameEl);

  // Fields
  matchFields.forEach((key, idx) => {
    const row = document.createElement('div');
    row.className = 'match-row';

    const label = document.createElement('div');
    label.className = 'match-row-label';
    label.textContent = FIELD_LABELS[key];
    row.appendChild(label);

    if (idx < matchFieldIndex) {
      const val = document.createElement('div');
      const ans = matchAnswered[key];
      if (ans.correct) {
        val.className = 'match-row-value val-correct';
        val.textContent = person[key];
      } else {
        val.className = 'match-row-value val-wrong';
        val.innerHTML = `<span class="struck">${ans.chosen}</span> → <span class="correct-inline">${person[key]}</span>`;
      }
      row.appendChild(val);
    } else if (idx === matchFieldIndex) {
      row.classList.add('match-row-active');
      const optionsDiv = document.createElement('div');
      optionsDiv.className = 'options-grid';
      optionsDiv.id = 'match-options';

      const correctVal = person[key] || "(none)";
      const others = PAGES.filter(p => p.name !== person.name && p[key] && p[key] !== correctVal);
      const shuffledOthers = shuffle(others);
      const uniqueDistractors = [];
      const seen = new Set([correctVal.toLowerCase()]);
      for (const o of shuffledOthers) {
        const v = o[key];
        if (!seen.has(v.toLowerCase())) {
          seen.add(v.toLowerCase());
          uniqueDistractors.push(v);
        }
        if (uniqueDistractors.length >= 3) break;
      }
      while (uniqueDistractors.length < 3) uniqueDistractors.push("—");
      const options = shuffle([correctVal, ...uniqueDistractors.slice(0, 3)]);

      options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.textContent = opt;
        btn.addEventListener('click', () => handleMatchFieldAnswer(btn, key, opt, correctVal));
        optionsDiv.appendChild(btn);
      });
      row.appendChild(optionsDiv);
    } else {
      const val = document.createElement('div');
      val.className = 'match-row-value val-pending';
      val.textContent = '?';
      row.appendChild(val);
    }
    card.appendChild(row);
  });

  // Done with this person?
  const done = matchFieldIndex >= matchFields.length;
  $('#match-next-btn').classList.toggle('show', done);

  setTimeout(() => {
    if (done) {
      $('#match-next-btn').scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      const activeRow = card.querySelector('.match-row-active');
      if (activeRow) activeRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, 50);
}

function handleMatchFieldAnswer(btn, key, chosen, correct) {
  if (matchLocked) return;
  matchLocked = true;

  const allBtns = $$('#match-options .option-btn');
  allBtns.forEach(b => b.classList.add('disabled'));

  const isCorrect = chosen === correct;
  if (isCorrect) {
    btn.classList.add('correct');
    totalScore.correct++;
  } else {
    btn.classList.add('wrong');
    totalScore.wrong++;
    personHadMistake = true;
    allBtns.forEach(b => { if (b.textContent === correct) b.classList.add('correct'); });
  }

  matchAnswered[key] = { chosen, correct: isCorrect };

  setTimeout(() => {
    matchFieldIndex++;
    matchLocked = false;
    renderMatchPage();
  }, 700);
}

function matchNextPerson() {
  if (personHadMistake) {
    batchMistakes.add(currentBatch[personIndex].name);
  }
  personIndex++;
  startNextPersonInBatch();
  setTimeout(() => {
    const card = $('#match-card-content');
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 50);
}

// ══════════════════════════════════════════════════════════════
// FREE WRITE MODE
// ══════════════════════════════════════════════════════════════
function startFreeWrite() {
  quizMode = 'freewrite';
  allPages = shuffle([...PAGES]);
  batchStart = 0;
  totalScore = { correct: 0, wrong: 0 };
  showScreen('fw-screen');
  startBatch();
}

function renderFWQuestion() {
  const person = currentBatch[personIndex];
  showScreen('fw-screen');
  updateHeader('fw');

  $('#fw-person-name').textContent = person.name;

  const container = $('#fw-fields');
  container.innerHTML = '';
  const fieldsToQuiz = getFieldsForPerson(person);

  fieldsToQuiz.forEach(key => {
    const div = document.createElement('div');
    div.className = 'fw-field';
    div.innerHTML = `
      <label>${FIELD_LABELS[key]}</label>
      <input type="text" data-key="${key}" autocomplete="off" spellcheck="false" />
      <div class="correction"></div>
    `;
    container.appendChild(div);
  });

  const firstInput = container.querySelector('input');
  if (firstInput) setTimeout(() => {
    firstInput.focus();
    firstInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 100);

  $('#fw-submit-btn').style.display = '';
  $('#fw-next-btn').classList.remove('show');
}

function submitFreeWrite() {
  const person = currentBatch[personIndex];
  const fields = $$('#fw-fields .fw-field');
  let hadMistake = false;

  fields.forEach(field => {
    const input = field.querySelector('input');
    const correction = field.querySelector('.correction');
    const key = input.dataset.key;
    const correct = person[key] || "";
    const answer = input.value.trim();
    input.disabled = true;

    if (answer.toLowerCase() === correct.toLowerCase()) {
      input.classList.add('correct');
      totalScore.correct++;
    } else {
      input.classList.add('wrong');
      totalScore.wrong++;
      hadMistake = true;
      correction.textContent = `✦ ${correct}`;
      correction.classList.add('show');
    }
  });

  if (hadMistake) {
    batchMistakes.add(person.name);
  }

  updateHeader('fw');
  $('#fw-submit-btn').style.display = 'none';
  $('#fw-next-btn').classList.add('show');

  setTimeout(() => {
    const firstWrong = document.querySelector('#fw-fields .fw-field input.wrong');
    if (firstWrong) {
      firstWrong.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      $('#fw-next-btn').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, 50);
}

function fwNext() {
  personIndex++;
  startNextPersonInBatch();
  setTimeout(() => {
    $('#fw-person-name').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 50);
}

// ══════════════════════════════════════════════════════════════
// RESULTS
// ══════════════════════════════════════════════════════════════
function showResults() {
  showScreen('results-screen');
  const total = totalScore.correct + totalScore.wrong;
  const pct = total === 0 ? 0 : Math.round((totalScore.correct / total) * 100);

  let cls = 'bad';
  if (pct >= 80) cls = 'great';
  else if (pct >= 50) cls = 'ok';

  $('#final-score').textContent = pct + '%';
  $('#final-score').className = 'final-score ' + cls;
  $('#final-detail').textContent = `${totalScore.correct} correct out of ${total} fields across ${allPages.length} pages`;
}

function restartSameMode() {
  if (quizMode === 'match') startMatching();
  else startFreeWrite();
}

// ══════════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  initPassword();

  if (sessionStorage.getItem('authed') === '1') {
    showMenu();
  } else {
    showScreen('password-screen');
    $('#pw-input').focus();
  }

  $('#btn-matching').addEventListener('click', startMatching);
  $('#btn-freewrite').addEventListener('click', startFreeWrite);

  $('#match-next-btn').addEventListener('click', matchNextPerson);
  $('#match-back').addEventListener('click', showMenu);

  $('#fw-submit-btn').addEventListener('click', submitFreeWrite);
  $('#fw-next-btn').addEventListener('click', fwNext);
  $('#fw-back').addEventListener('click', showMenu);

  $('#results-retry').addEventListener('click', restartSameMode);
  $('#results-menu').addEventListener('click', showMenu);

  // Enter key for free write
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && quizMode === 'freewrite' && $('#fw-screen').classList.contains('active')) {
      const submitBtn = $('#fw-submit-btn');
      const nextBtn = $('#fw-next-btn');
      if (submitBtn.style.display !== 'none') {
        submitFreeWrite();
      } else if (nextBtn.classList.contains('show')) {
        fwNext();
      }
    }
  });
});
