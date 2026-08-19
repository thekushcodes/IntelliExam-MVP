
/**
 * Adaptive Exam System - JavaScript Engine
 * Dynamic difficulty scaling,
 * prerequisite remediation, random probability branching, and fallback logic.
 */

// Global State
let questions = [];
let currentQuestion = null;
let selectedOption = null; // 1-based index (1, 2, 3, or 4)
let score = 0;
let totalAsked = 0;
let examHistory = []; // Tracks detailed log of each question asked

// Configurable probability: 80% higher difficulty on correct, 20% lower difficulty
const HIGHER_DIFFICULTY_PROBABILITY = 0.8;

// DOM Elements
const DOM = {
  loadingState: document.getElementById('loading-state'),
  errorState: document.getElementById('error-state'),
  errorMessage: document.getElementById('error-message'),
  examContainer: document.getElementById('exam-container'),
  finishedState: document.getElementById('finished-state'),
  
  // Header / Progress
  questionNumber: document.getElementById('question-number'),
  totalQuestions: document.getElementById('total-questions'),
  currentScore: document.getElementById('current-score'),
  progressBar: document.getElementById('progress-bar'),
  
  // Question Card
  difficultyBadge: document.getElementById('difficulty-badge'),
  topicTag: document.getElementById('topic-tag'),
  subtopicTag: document.getElementById('subtopic-tag'),
  questionText: document.getElementById('question-text'),
  optionsContainer: document.getElementById('options-container'),
  validationMsg: document.getElementById('validation-msg'),
  
  // Actions & Feedback
  submitBtn: document.getElementById('submit-btn'),
  nextBtn: document.getElementById('next-btn'),
  feedbackContainer: document.getElementById('feedback-container'),
  feedbackIcon: document.getElementById('feedback-icon'),
  feedbackTitle: document.getElementById('feedback-title'),
  feedbackText: document.getElementById('feedback-text'),
  algorithmInsight: document.getElementById('algorithm-insight'),
  
  // Finished State Elements
  finalScore: document.getElementById('final-score'),
  finalAccuracy: document.getElementById('final-accuracy'),
  finalTotal: document.getElementById('final-total'),
  highestDifficulty: document.getElementById('highest-difficulty'),
  historyContainer: document.getElementById('history-container'),
  restartBtn: document.getElementById('restart-btn')
};

// ==========================================
// 1. DATA LOADING & INITIALIZATION
// ==========================================

/**
 * Fetch questions from questions.json and initialize runtime asked state.
 */
async function loadQuestions() {
  try {
    const response = await fetch('questions.json');
    if (!response.ok) {
      throw new Error(`HTTP Error! Status: ${response.status}`);
    }
    const data = await response.json();
    
    if (!data.questions || !Array.isArray(data.questions) || data.questions.length === 0) {
      throw new Error("Invalid format: 'questions' array missing or empty in questions.json");
    }

    // Attach dynamic runtime property `asked: false` to each question without modifying JSON
    return data.questions.map(q => ({
      ...q,
      asked: false
    }));
  } catch (error) {
    console.error("Failed to load questions:", error);
    showError(`Could not load questions: ${error.message}`);
    return null;
  }
}

// ==========================================
// 2. SELECTION ALGORITHM FUNCTIONS
// ==========================================

/**
 * Check whether any unanswered questions remain in the pool.
 */
function hasQuestionsRemaining(questionsList) {
  return questionsList.some(q => !q.asked);
}

/**
 * Find starting question around difficulty level 5.
 * If no difficulty 5 question exists, returns unanswered question with closest difficulty.
 */
function findStartingQuestion(questionsList) {
  const unanswered = questionsList.filter(q => !q.asked);
  if (unanswered.length === 0) return null;

  // Exact match for difficulty 5
  const exactFive = unanswered.find(q => q.difficulty === 5);
  if (exactFive) return exactFive;

  // Closest difficulty fallback
  let closest = unanswered[0];
  let minDiff = Math.abs(closest.difficulty - 5);

  for (let i = 1; i < unanswered.length; i++) {
    const diff = Math.abs(unanswered[i].difficulty - 5);
    if (diff < minDiff) {
      minDiff = diff;
      closest = unanswered[i];
    }
  }

  return closest;
}

/**
 * Select unanswered question with difficulty higher than currentDifficulty.
 * Prefers exact next level (currentDifficulty + 1), otherwise closest higher difficulty.
 */
function selectHigherDifficulty(questionsList, currentDifficulty) {
  const higherQuestions = questionsList.filter(q => !q.asked && q.difficulty > currentDifficulty);
  if (higherQuestions.length === 0) return null;

  // Prefer exact next level
  const exactNext = higherQuestions.find(q => q.difficulty === currentDifficulty + 1);
  if (exactNext) return exactNext;

  // Otherwise, find closest higher difficulty
  higherQuestions.sort((a, b) => a.difficulty - b.difficulty);
  return higherQuestions[0];
}

/**
 * Select unanswered question with difficulty lower than currentDifficulty.
 * Prefers exact previous level (currentDifficulty - 1), otherwise closest lower difficulty.
 */
function selectLowerDifficulty(questionsList, currentDifficulty) {
  const lowerQuestions = questionsList.filter(q => !q.asked && q.difficulty < currentDifficulty);
  if (lowerQuestions.length === 0) return null;

  // Prefer exact lower level
  const exactLower = lowerQuestions.find(q => q.difficulty === currentDifficulty - 1);
  if (exactLower) return exactLower;

  // Otherwise, find closest lower difficulty
  lowerQuestions.sort((a, b) => b.difficulty - a.difficulty);
  return lowerQuestions[0];
}

/**
 * Search for unanswered questions matching current question's prerequisites.
 * Matches prerequisite string against topic or subtopic fields.
 * If multiple prerequisites exist, returns closest lower or suitable difficulty.
 */
function selectPrerequisiteQuestion(questionsList, currentQuestion) {
  if (!currentQuestion.prerequisites || currentQuestion.prerequisites.length === 0) {
    return null;
  }

  const matchingQuestions = [];

  for (const prerequisite of currentQuestion.prerequisites) {
    for (const q of questionsList) {
      if (!q.asked && (q.topic === prerequisite || q.subtopic === prerequisite)) {
        matchingQuestions.push(q);
      }
    }
  }

  if (matchingQuestions.length === 0) return null;

  // Sort by closest difficulty to current question, preferring lower/equal difficulty
  matchingQuestions.sort((a, b) => {
    const diffA = Math.abs(a.difficulty - currentQuestion.difficulty);
    const diffB = Math.abs(b.difficulty - currentQuestion.difficulty);
    return diffA - diffB;
  });

  return matchingQuestions[0];
}

/**
 * Universal fallback selection when preferred strategies yield no questions.
 * Finds any unanswered question with minimum difficulty distance.
 */
function selectFallbackQuestion(questionsList, currentDifficulty) {
  const unanswered = questionsList.filter(q => !q.asked);
  if (unanswered.length === 0) return null;

  unanswered.sort((a, b) => {
    const diffA = Math.abs(a.difficulty - currentDifficulty);
    const diffB = Math.abs(b.difficulty - currentDifficulty);
    return diffA - diffB;
  });

  return unanswered[0];
}

/**
 * Main decision-making function for next question selection.
 * Returns { nextQuestion, insight } object detailing selected question and algorithm rationale.
 */
function selectNextQuestion(questionsList, currentQ, wasCorrect) {
  let nextQ = null;
  let insight = "";

  if (wasCorrect) {
    // Configurable probability branching (e.g. 80% higher, 20% lower)
    const roll = Math.random();
    const tryHigher = roll < HIGHER_DIFFICULTY_PROBABILITY;

    if (tryHigher) {
      nextQ = selectHigherDifficulty(questionsList, currentQ.difficulty);
      if (nextQ) {
        insight = `Correct answer! Algorithm increased difficulty: Level ${currentQ.difficulty} → Level ${nextQ.difficulty}.`;
      } else {
        // Fallback to lower if higher exhausted
        nextQ = selectLowerDifficulty(questionsList, currentQ.difficulty);
        if (nextQ) {
          insight = `Correct answer! Higher difficulties exhausted; moved to Level ${nextQ.difficulty}.`;
        }
      }
    } else {
      // 20% random lower difficulty check
      nextQ = selectLowerDifficulty(questionsList, currentQ.difficulty);
      if (nextQ) {
        insight = `Correct answer! Configurable probability (20%) selected lower difficulty: Level ${currentQ.difficulty} → Level ${nextQ.difficulty}.`;
      } else {
        nextQ = selectHigherDifficulty(questionsList, currentQ.difficulty);
        if (nextQ) {
          insight = `Correct answer! Algorithm increased difficulty: Level ${currentQ.difficulty} → Level ${nextQ.difficulty}.`;
        }
      }
    }
  } else {
    // Answer WRONG: Priority 1 - Prerequisite remediation
    nextQ = selectPrerequisiteQuestion(questionsList, currentQ);
    if (nextQ) {
      insight = `Wrong answer! Remediating prerequisite topic/subtopic for Level ${currentQ.difficulty} → Level ${nextQ.difficulty} (${nextQ.topic} / ${nextQ.subtopic}).`;
    } else {
      // Priority 2 - Lower difficulty
      nextQ = selectLowerDifficulty(questionsList, currentQ.difficulty);
      if (nextQ) {
        insight = `Wrong answer! Reduced difficulty: Level ${currentQ.difficulty} → Level ${nextQ.difficulty}.`;
      }
    }
  }

  // Fallback behavior: Test must NOT end if ANY unanswered question remains
  if (!nextQ && hasQuestionsRemaining(questionsList)) {
    nextQ = selectFallbackQuestion(questionsList, currentQ.difficulty);
    if (nextQ) {
      insight = `Preferred criteria exhausted. Selected nearest available question at Level ${nextQ.difficulty}.`;
    }
  }

  return { nextQuestion: nextQ, insight };
}

// ==========================================
// 3. EXAM EVALUATION & STATE MANAGEMENT
// ==========================================

/**
 * Compare user's selected 1-based option index with correctOption.
 */
function checkAnswer(question, userSelection) {
  return userSelection === question.correctOption;
}

/**
 * Mark question as asked in runtime state.
 */
function markQuestionAsked(question) {
  question.asked = true;
}

// ==========================================
// 4. FRONTEND UI & RENDER LOGIC
// ==========================================

function showError(msg) {
  DOM.loadingState.style.display = 'none';
  DOM.examContainer.style.display = 'none';
  DOM.finishedState.style.display = 'none';
  DOM.errorState.style.display = 'block';
  DOM.errorMessage.textContent = msg;
}

/**
 * Render the current question and options to DOM.
 */
function renderQuestion(q) {
  selectedOption = null;
  DOM.validationMsg.style.display = 'none';
  DOM.feedbackContainer.style.display = 'none';
  DOM.submitBtn.style.display = 'inline-flex';
  DOM.nextBtn.style.display = 'none';

  // Header stats
  DOM.questionNumber.textContent = totalAsked + 1;
  DOM.totalQuestions.textContent = questions.length;
  DOM.currentScore.textContent = score;

  const progressPercent = (totalAsked / questions.length) * 100;
  DOM.progressBar.style.width = `${progressPercent}%`;

  // Question Card details
  DOM.questionText.textContent = q.question;
  DOM.difficultyBadge.textContent = `Difficulty ${q.difficulty}`;
  DOM.difficultyBadge.className = `badge difficulty-${q.difficulty}`;
  DOM.topicTag.textContent = q.topic;
  DOM.subtopicTag.textContent = q.subtopic;

  // Render 4 options (1-based indexing)
  DOM.optionsContainer.innerHTML = '';
  q.options.forEach((optText, idx) => {
    const optionNum = idx + 1; // 1-based indexing

    const optCard = document.createElement('div');
    optCard.className = 'option-card';
    optCard.dataset.option = optionNum;

    optCard.innerHTML = `
      <div class="option-num">${optionNum}</div>
      <div class="option-text">${escapeHtml(optText)}</div>
    `;

    optCard.addEventListener('click', () => {
      if (DOM.submitBtn.style.display === 'none') return; // Readonly after submit

      document.querySelectorAll('.option-card').forEach(card => card.classList.remove('selected'));
      optCard.classList.add('selected');
      selectedOption = optionNum;
      DOM.validationMsg.style.display = 'none';
    });

    DOM.optionsContainer.appendChild(optCard);
  });
}

/**
 * Handle submit answer button click.
 */
function handleAnswerSubmit() {
  if (selectedOption === null) {
    DOM.validationMsg.style.display = 'block';
    return;
  }

  // 1. Check answer
  const isCorrect = checkAnswer(currentQuestion, selectedOption);
  
  // 2. Mark question as asked immediately
  markQuestionAsked(currentQuestion);
  totalAsked++;

  if (isCorrect) score++;

  // 3. Highlight options visually
  const optionCards = DOM.optionsContainer.querySelectorAll('.option-card');
  optionCards.forEach(card => {
    const optNum = parseInt(card.dataset.option, 10);
    card.classList.remove('selected');

    if (optNum === currentQuestion.correctOption) {
      card.classList.add('correct');
    } else if (optNum === selectedOption && !isCorrect) {
      card.classList.add('incorrect');
    }
  });

  // 4. Select next question adaptively
  const { nextQuestion, insight } = selectNextQuestion(questions, currentQuestion, isCorrect);

  // Store in exam history log
  examHistory.push({
    question: currentQuestion,
    userOption: selectedOption,
    isCorrect,
    insight: insight || "Test completed."
  });

  // 5. Display feedback UI
  DOM.feedbackContainer.style.display = 'block';
  if (isCorrect) {
    DOM.feedbackContainer.className = 'feedback-banner feedback-correct';
    DOM.feedbackIcon.textContent = '✓';
    DOM.feedbackTitle.textContent = 'Correct Answer!';
    DOM.feedbackText.textContent = `Great job! Option ${selectedOption} is correct.`;
  } else {
    DOM.feedbackContainer.className = 'feedback-banner feedback-incorrect';
    DOM.feedbackIcon.textContent = '✕';
    DOM.feedbackTitle.textContent = 'Incorrect Answer';
    DOM.feedbackText.textContent = `Option ${selectedOption} is wrong. Correct answer was Option ${currentQuestion.correctOption}: "${currentQuestion.options[currentQuestion.correctOption - 1]}".`;
  }

  DOM.algorithmInsight.textContent = insight || (hasQuestionsRemaining(questions) ? "" : "All available questions have been completed!");

  // Toggle button visibility
  DOM.submitBtn.style.display = 'none';
  DOM.nextBtn.style.display = 'inline-flex';

  // Save reference to next question
  currentQuestion = nextQuestion;
}

/**
 * Handle Next Question button click or finish exam.
 */
function handleNextQuestion() {
  if (currentQuestion !== null && hasQuestionsRemaining(questions)) {
    renderQuestion(currentQuestion);
  } else {
    showTestFinished();
  }
}

/**
 * Display final summary screen.
 */
function showTestFinished() {
  DOM.examContainer.style.display = 'none';
  DOM.finishedState.style.display = 'block';

  DOM.finalScore.textContent = `${score} / ${totalAsked}`;
  const accuracyPct = totalAsked > 0 ? Math.round((score / totalAsked) * 100) : 0;
  DOM.finalAccuracy.textContent = `${accuracyPct}%`;
  DOM.finalTotal.textContent = totalAsked;

  const highest = examHistory.reduce((max, h) => Math.max(max, h.question.difficulty), 0);
  DOM.highestDifficulty.textContent = highest || 'N/A';

  // Render question breakdown list
  DOM.historyContainer.innerHTML = '';
  examHistory.forEach((item, i) => {
    const hItem = document.createElement('div');
    hItem.className = `history-item ${item.isCorrect ? 'history-correct' : 'history-incorrect'}`;
    hItem.innerHTML = `
      <div class="history-header">
        <span class="history-qnum">Q${i + 1}. ${escapeHtml(item.question.question)}</span>
        <span class="badge difficulty-${item.question.difficulty}">Diff ${item.question.difficulty}</span>
      </div>
      <div class="history-details">
        <span>Topic: <strong>${item.question.topic}</strong> (${item.question.subtopic})</span> |
        <span>Result: <strong style="color: ${item.isCorrect ? 'var(--success-color)' : 'var(--danger-color)'}">${item.isCorrect ? 'Correct' : 'Wrong'}</strong></span>
      </div>
      <div class="history-insight">💡 <em>${escapeHtml(item.insight)}</em></div>
    `;
    DOM.historyContainer.appendChild(hItem);
  });
}

/**
 * Reset state and restart exam.
 */
function restartExam() {
  questions.forEach(q => q.asked = false);
  score = 0;
  totalAsked = 0;
  examHistory = [];
  selectedOption = null;

  DOM.finishedState.style.display = 'none';
  DOM.examContainer.style.display = 'block';

  currentQuestion = findStartingQuestion(questions);
  if (currentQuestion) {
    renderQuestion(currentQuestion);
  } else {
    showError("No questions available to start.");
  }
}

// Helper to escape HTML characters
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ==========================================
// 5. INITIALIZATION EVENT LISTENERS
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
  DOM.submitBtn.addEventListener('click', handleAnswerSubmit);
  DOM.nextBtn.addEventListener('click', handleNextQuestion);
  DOM.restartBtn.addEventListener('click', restartExam);

  // Load questions and start exam
  questions = await loadQuestions();

  if (questions && questions.length > 0) {
    DOM.loadingState.style.display = 'none';
    DOM.examContainer.style.display = 'block';

    currentQuestion = findStartingQuestion(questions);
    if (currentQuestion) {
      renderQuestion(currentQuestion);
    } else {
      showError("Could not find a valid starting question.");
    }
  }
});
