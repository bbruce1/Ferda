// ============================================================
// APP LOGIC
// ============================================================

const PASSWORD = "baghuckers";

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

// Map internal field keys to nice labels
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

// Base fields used in quizzing (everything except name)
const BASE_FIELDS = ["page", "yearMajor", "hometown", "position", "bigBrother", "littleBrother", "pledgeClass"];

// Get the fields to quiz for a specific person — skips any field that is null/empty
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

// ── State ────────────────────────────────────────────────────
let quizPages = [];
let quizIndex = 0;         // which person we're on
let quizScore = { correct: 0, wrong: 0 };  // per-field scoring
let quizMode = '';         // 'match' or 'freewrite'

// Matching-specific state: step through fields within one person
let matchFieldIndex = 0;
let matchFields = [];       // fields for current person
let matchAnswered = {};     // tracks what's been answered for current person
let matchLocked = false;    // prevent clicks during transition

// ══════════════════════════════════════════════════════════════
// MATCHING MODE
// ══════════════════════════════════════════════════════════════
function startMatching() {
  if (PAGES.length < 3) { alert("Need at least 3 pages for matching!"); return; }
  quizMode = 'match';
  quizPages = shuffle(PAGES);
  quizIndex = 0;
  quizScore = { correct: 0, wrong: 0 };
  showScreen('match-screen');
  startMatchPerson();
}

// Begin a new person — reset field stepper
function startMatchPerson() {
  if (quizIndex >= quizPages.length) { showResults(); return; }
  const person = quizPages[quizIndex];
  matchFields = getFieldsForPerson(person);
  matchFieldIndex = 0;
  matchAnswered = {};
  matchLocked = false;
  renderMatchPage();
}

// Render the full page card with answered fields + current question
function renderMatchPage() {
  const person = quizPages[quizIndex];
  const totalFields = quizPages.reduce((sum, p) => sum + getFieldsForPerson(p).length, 0);
  const answeredSoFar = quizScore.correct + quizScore.wrong;

  // Header
  $('#match-score').innerHTML = `<span class="correct">${quizScore.correct}✓</span> · <span class="wrong">${quizScore.wrong}✗</span>`;
  const pct = totalFields > 0 ? (answeredSoFar / totalFields) * 100 : 0;
  $('#match-progress').style.width = pct + '%';
  $('#match-person-count').textContent = `Person ${quizIndex + 1} of ${quizPages.length}`;

  // Build the page card
  const card = $('#match-card-content');
  card.innerHTML = '';

  // Name at top
  const nameEl = document.createElement('div');
  nameEl.className = 'person-name';
  nameEl.textContent = person.name;
  card.appendChild(nameEl);

  // Render each field
  matchFields.forEach((key, idx) => {
    const row = document.createElement('div');
    row.className = 'match-row';

    const label = document.createElement('div');
    label.className = 'match-row-label';
    label.textContent = FIELD_LABELS[key];
    row.appendChild(label);

    if (idx < matchFieldIndex) {
      // Already answered — show the result
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
      // Current question — show multiple choice
      row.classList.add('match-row-active');

      const optionsDiv = document.createElement('div');
      optionsDiv.className = 'options-grid';
      optionsDiv.id = 'match-options';

      const correctVal = person[key] || "(none)";
      const others = PAGES.filter(p => p.name !== person.name && p[key] && p[key] !== correctVal);
      const shuffledOthers = shuffle(others);

      // Deduplicate distractors
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
      // Future field — show placeholder
      const val = document.createElement('div');
      val.className = 'match-row-value val-pending';
      val.textContent = '?';
      row.appendChild(val);
    }

    card.appendChild(row);
  });

  // Show/hide the "Next Person" button
  const done = matchFieldIndex >= matchFields.length;
  $('#match-next-btn').classList.toggle('show', done);

  // Auto-scroll: to the active row or the next-person button
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

  // Disable all buttons for this question
  const allBtns = $$('#match-options .option-btn');
  allBtns.forEach(b => b.classList.add('disabled'));

  const isCorrect = chosen === correct;
  if (isCorrect) {
    btn.classList.add('correct');
    quizScore.correct++;
  } else {
    btn.classList.add('wrong');
    quizScore.wrong++;
    allBtns.forEach(b => { if (b.textContent === correct) b.classList.add('correct'); });
  }

  matchAnswered[key] = { chosen, correct: isCorrect };

  // After a brief delay, advance to next field
  setTimeout(() => {
    matchFieldIndex++;
    matchLocked = false;
    renderMatchPage();
  }, 700);
}

function matchNextPerson() {
  quizIndex++;
  startMatchPerson();
  // Scroll to top of the card for the new person
  setTimeout(() => {
    $('#match-card-content').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 50);
}

// ══════════════════════════════════════════════════════════════
// FREE WRITE MODE
// ══════════════════════════════════════════════════════════════
function startFreeWrite() {
  quizMode = 'freewrite';
  quizPages = shuffle(PAGES);
  quizIndex = 0;
  quizScore = { correct: 0, wrong: 0 };
  showScreen('fw-screen');
  renderFWQuestion();
}

function renderFWQuestion() {
  if (quizIndex >= quizPages.length) { showResults(); return; }

  const person = quizPages[quizIndex];
  const totalFields = quizPages.reduce((sum, p) => sum + getFieldsForPerson(p).length, 0);
  const answeredSoFar = quizScore.correct + quizScore.wrong;

  $('#fw-score').innerHTML = `<span class="correct">${quizScore.correct}✓</span> · <span class="wrong">${quizScore.wrong}✗</span>`;
  const pct = totalFields > 0 ? (answeredSoFar / totalFields) * 100 : 0;
  $('#fw-progress').style.width = pct + '%';

  $('#fw-person-name').textContent = person.name;
  $('#fw-person-count').textContent = `Person ${quizIndex + 1} of ${quizPages.length}`;

  // Build fields
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

  // Focus first input
  const firstInput = container.querySelector('input');
  if (firstInput) setTimeout(() => {
    firstInput.focus();
    firstInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 100);

  $('#fw-submit-btn').style.display = '';
  $('#fw-next-btn').classList.remove('show');
}

function submitFreeWrite() {
  const person = quizPages[quizIndex];
  const fields = $$('#fw-fields .fw-field');

  fields.forEach(field => {
    const input = field.querySelector('input');
    const correction = field.querySelector('.correction');
    const key = input.dataset.key;
    const correct = person[key] || "";
    const answer = input.value.trim();

    input.disabled = true;

    // Case-insensitive, trim comparison
    if (answer.toLowerCase() === correct.toLowerCase()) {
      input.classList.add('correct');
      quizScore.correct++;
    } else {
      input.classList.add('wrong');
      quizScore.wrong++;
      correction.textContent = `✦ ${correct}`;
      correction.classList.add('show');
    }
  });

  $('#fw-score').innerHTML = `<span class="correct">${quizScore.correct}✓</span> · <span class="wrong">${quizScore.wrong}✗</span>`;
  $('#fw-submit-btn').style.display = 'none';
  $('#fw-next-btn').classList.add('show');

  // Auto-scroll to the first wrong field, or the next button if all correct
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
  quizIndex++;
  renderFWQuestion();
  // Scroll to top of the card for the new person
  setTimeout(() => {
    $('#fw-person-name').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 50);
}

// ══════════════════════════════════════════════════════════════
// RESULTS
// ══════════════════════════════════════════════════════════════
function showResults() {
  showScreen('results-screen');
  const total = quizScore.correct + quizScore.wrong;
  const pct = total === 0 ? 0 : Math.round((quizScore.correct / total) * 100);

  let cls = 'bad';
  if (pct >= 80) cls = 'great';
  else if (pct >= 50) cls = 'ok';

  $('#final-score').textContent = pct + '%';
  $('#final-score').className = 'final-score ' + cls;
  $('#final-detail').textContent = `${quizScore.correct} correct out of ${total} fields across ${quizPages.length} pages`;
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

  // Check if already authed this session
  if (sessionStorage.getItem('authed') === '1') {
    showMenu();
  } else {
    showScreen('password-screen');
    $('#pw-input').focus();
  }

  // Menu buttons
  $('#btn-matching').addEventListener('click', startMatching);
  $('#btn-freewrite').addEventListener('click', startFreeWrite);

  // Match controls
  $('#match-next-btn').addEventListener('click', matchNextPerson);
  $('#match-back').addEventListener('click', showMenu);

  // Free write controls
  $('#fw-submit-btn').addEventListener('click', submitFreeWrite);
  $('#fw-next-btn').addEventListener('click', fwNext);
  $('#fw-back').addEventListener('click', showMenu);

  // Results
  $('#results-retry').addEventListener('click', restartSameMode);
  $('#results-menu').addEventListener('click', showMenu);

  // Allow Enter to submit free write
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
