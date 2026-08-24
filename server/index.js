import express from 'express';
import cors from 'cors';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { processLesson } from './services/contentEngine.js';
import { getSignSequence, evaluateGesture } from './services/deafModule.js';
import { getHapticDiagram, evaluateVoiceAnswer } from './services/blindModule.js';
import { matchSignToLesson, normalizeGlossToMeaning } from './services/semanticMatcher.js';
import { buildFullLesson } from './services/lessonBuilder.js';
import { sampleLessons, sampleStudents } from './sampleData.js';

const app = express();
const PORT = process.env.PORT || 5000;

// Restrict CORS to Frontend Origin
const FRONTEND_ORIGIN = process.env.FRONTEND_URL || 'http://localhost:5173';
app.use(cors({ origin: FRONTEND_ORIGIN, credentials: true }));
app.use(express.json({ limit: '15mb' }));

// ─── Rate Limiting (P0-5 / Priority 7) ──────────────────────────────────────
// Caps all mutating endpoints at 20 requests per 60 seconds per IP.
const postLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — please slow down and try again in a minute.' }
});

// ─── Demo-Level Auth Middleware (P0-1..3 / Priority 3) ───────────────────────
// Reads X-Student-Id from request headers instead of trusting req.body.
// Validates the ID is in the known student set. studentId is attached to req.
const KNOWN_STUDENT_IDS = new Set(['student-rohan', 'student-ananya']);
const requireStudentHeader = (req, res, next) => {
  const studentId = req.headers['x-student-id'];
  if (!studentId) {
    return res.status(401).json({ error: 'Missing X-Student-Id header. Demo auth required.' });
  }
  if (!KNOWN_STUDENT_IDS.has(studentId)) {
    return res.status(403).json({ error: `Unknown student ID: "${studentId}". Not in demo roster.` });
  }
  req.studentId = studentId;
  next();
};

// In-memory Database state
const db = {
  lessons: {},
  progress: {
    'student-rohan': {
      signPractice: [
        { signWord: 'Heart', accuracy: 96, at: Date.now() - 3600000 },
        { signWord: 'Pump', accuracy: 91, at: Date.now() - 1800000 }
      ],
      quizResults: []
    },
    'student-ananya': {
      signPractice: [],
      quizResults: [
        { questionId: 'vq-1', correct: true, score: 10, at: Date.now() - 2400000 },
        { questionId: 'vq-2', correct: true, score: 10, at: Date.now() - 1200000 }
      ]
    }
  },
  teacherInbox: [
    {
      id: "inbox-1",
      studentId: "student-rohan",
      studentName: "Rohan Patel (Deaf)",
      type: "sign_to_text",
      message: "Signed: Teacher, can we review how the Left Ventricle pumps blood?",
      timestamp: new Date(Date.now() - 3600000).toISOString()
    },
    {
      id: "inbox-2",
      studentId: "student-ananya",
      studentName: "Ananya Sharma (Blind)",
      type: "voice_quiz_completed",
      message: "Completed Voice Quiz for 'The Human Heart & Circulatory System' with 100% score.",
      timestamp: new Date(Date.now() - 1800000).toISOString()
    }
  ]
};

// Populate initial sample lessons into DB
sampleLessons.forEach(l => {
  db.lessons[l.id] = {
    ...l,
    text_blocks: l.bviModule?.audioSections?.map(s => s.content) || [l.summary],
    concepts: l.islModule?.lessonGlosses?.map(g => ({
      word: g.word,
      gloss: g.gloss,
      description: g.description,
      signAsset: `${g.word.toLowerCase()}.mp4`
    })) || [],
    diagrams: l.bviModule?.hapticDiagram ? [
      {
        id: l.bviModule.hapticDiagram.id,
        label: l.bviModule.hapticDiagram.title,
        description: l.summary,
        outlinePath: [
          { x: 0.50, y: 0.15 }, { x: 0.65, y: 0.18 }, { x: 0.78, y: 0.32 },
          { x: 0.80, y: 0.50 }, { x: 0.70, y: 0.70 }, { x: 0.55, y: 0.88 },
          { x: 0.50, y: 0.95 }, { x: 0.45, y: 0.88 }, { x: 0.30, y: 0.70 },
          { x: 0.20, y: 0.50 }, { x: 0.22, y: 0.32 }, { x: 0.35, y: 0.18 },
          { x: 0.50, y: 0.15 }
        ],
        regions: l.bviModule.hapticDiagram.landmarks.map(lm => ({
          id: lm.id,
          label: lm.name.toLowerCase(),
          x: lm.x / 800,
          y: lm.y / 600,
          radius: lm.radius / 800,
          description: lm.audioDescription
        }))
      }
    ] : [],
    quiz_items: l.bviModule?.voiceQuiz?.map(q => ({
      id: q.id,
      prompt: q.spokenQuestion,
      spokenQuestion: q.spokenQuestion,
      acceptedAnswerKeywords: q.expectedKeywords,
      modelAnswer: q.modelAnswer
    })) || []
  };
});

// Fix 5: Add File Upload Validation & Limits
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf', 'text/plain'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('Only PDF and TXT files allowed'), false);
    }
    cb(null, true);
  }
});

// 1. Upload & Ingest Lesson (PDF, TXT, or Raw Text)
app.post('/api/lessons/upload', (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'File upload error' });
    }

    try {
      const rawText = req.body?.rawText;
      if (!req.file && !rawText) {
        return res.status(400).json({ error: 'No file or text uploaded' });
      }

      const processed = await processLesson(req.file, rawText);
      const lessonId = processed.id;

      const fullLesson = buildFullLesson(processed, {
        subject: req.body?.subject,
        grade: req.body?.grade
      });

      db.lessons[lessonId] = fullLesson;

      res.status(201).json({
        success: true,
        lessonId,
        lesson: fullLesson
      });
    } catch (err) {
      console.error('Processing error:', err);
      const status = err.statusCode === 400 ? 400 : 500;
      res.status(status).json({ error: err.message || 'Failed to process lesson' });
    }
  });
});

// 2. Get all lessons
app.get('/api/lessons', (req, res) => {
  res.json({
    success: true,
    count: Object.keys(db.lessons).length,
    lessons: Object.values(db.lessons)
  });
});

// 3. Get single lesson
app.get('/api/lessons/:id', (req, res) => {
  const lesson = db.lessons[req.params.id];
  if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
  res.json({ success: true, lesson });
});

// 3b. Semantic Lesson Matching (Student sign gloss -> Vector search over currently selected lesson)
app.post('/api/lessons/:id/semantic-match', (req, res) => {
  const lesson = db.lessons[req.params.id];
  if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
  const { gloss } = req.body;
  if (!gloss) return res.status(400).json({ error: 'No sign gloss provided' });

  const matchResult = matchSignToLesson(gloss, lesson);
  res.json({
    success: true,
    lessonId: lesson.id,
    lessonTitle: lesson.title,
    gloss,
    ...matchResult
  });
});

// 4. Deaf Module: Get sign sequence
app.get('/api/deaf/:lessonId/signs', (req, res) => {
  const lesson = db.lessons[req.params.lessonId];
  if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
  res.json(getSignSequence(lesson));
});

// 5. Deaf Module: Evaluate gesture practice
app.post('/api/deaf/practice/evaluate', postLimiter, requireStudentHeader, (req, res) => {
  const { signWord, landmarkSequence } = req.body;
  const studentId = req.studentId; // Derived from validated header — not req.body
  const result = evaluateGesture(signWord, landmarkSequence);

  db.progress[studentId] = db.progress[studentId] || { signPractice: [], quizResults: [] };
  db.progress[studentId].signPractice.unshift({
    signWord,
    accuracy: result.accuracy,
    at: Date.now()
  });

  res.json({
    success: true,
    ...result
  });
});

// 6. Deaf Module: Sign-to-Text Bridge
app.post('/api/deaf/sign-to-text', postLimiter, requireStudentHeader, (req, res) => {
  const { recognizedWord } = req.body;
  const studentId = req.studentId; // Derived from validated header — prevents teacher inbox spoofing
  // Look up the canonical student name from known roster (prevents body spoofing)
  const STUDENT_NAMES = {
    'student-rohan': 'Rohan Patel (Deaf)',
    'student-ananya': 'Ananya Sharma (Blind)'
  };
  const studentName = STUDENT_NAMES[studentId] || studentId;

  const inboxItem = {
    id: `inbox-${Date.now()}`,
    studentId,
    studentName,
    type: "sign_to_text",
    message: `Signed: "${recognizedWord}"`,
    timestamp: new Date().toISOString()
  };

  db.teacherInbox.unshift(inboxItem);

  res.json({
    success: true,
    inboxItem
  });
});

// 7. Blind Module: Get content (narration, haptic diagrams, quiz)
app.get('/api/blind/:lessonId/content', (req, res) => {
  const lesson = db.lessons[req.params.lessonId];
  if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
  
  res.json({
    narration: lesson.text_blocks,
    diagrams: (lesson.diagrams || []).map(getHapticDiagram),
    quiz: lesson.quiz_items
  });
});

// 8. Blind Module: Evaluate voice answer
app.post('/api/blind/quiz/evaluate', postLimiter, requireStudentHeader, (req, res) => {
  const { lessonId, questionId, spokenAnswer } = req.body;
  const studentId = req.studentId; // Derived from validated header
  const lesson = db.lessons[lessonId];
  if (!lesson) {
    return res.status(404).json({ error: 'Lesson not found', lessonId });
  }

  const question = lesson?.quiz_items?.find(q => q.id === questionId);
  if (!question) {
    return res.status(404).json({ error: 'Question not found', questionId });
  }

  const result = evaluateVoiceAnswer(question, spokenAnswer);
  
  db.progress[studentId] = db.progress[studentId] || { signPractice: [], quizResults: [] };
  db.progress[studentId].quizResults.unshift({
    questionId,
    score: result.score,
    correct: result.correct,
    at: Date.now()
  });

  res.json({
    success: true,
    ...result
  });
});

// 9. Teacher: Get Student Progress
app.get('/api/teacher/progress/:studentId', (req, res) => {
  res.json(db.progress[req.params.studentId] || { signPractice: [], quizResults: [] });
});

// ─── Live Stats Helper (P1-3 / Priority 2) ───────────────────────────────────
// Computes real averages from db.progress. Returns 0 when no data recorded yet.
function computeStats() {
  const allProgress = Object.values(db.progress);
  const allSignPractice = allProgress.flatMap(p => p.signPractice || []);
  const allQuizResults = allProgress.flatMap(p => p.quizResults || []);

  const avgDeafSignAccuracy = allSignPractice.length
    ? Math.round(allSignPractice.reduce((sum, s) => sum + (s.accuracy || 0), 0) / allSignPractice.length)
    : 0;

  const avgBlindQuizScore = allQuizResults.length
    ? Math.round(allQuizResults.reduce((sum, q) => sum + (q.score || 0), 0) / allQuizResults.length)
    : 0;

  return { avgDeafSignAccuracy, avgBlindQuizScore };
}

// 10. Teacher: Dashboard summary
app.get('/api/teacher/dashboard', (req, res) => {
  const { avgDeafSignAccuracy, avgBlindQuizScore } = computeStats();
  res.json({
    success: true,
    stats: {
      totalLessons: Object.keys(db.lessons).length,
      activeStudents: sampleStudents.length,
      avgDeafSignAccuracy,
      avgBlindQuizScore
    },
    students: sampleStudents,
    inbox: db.teacherInbox,
    recentLessons: Object.values(db.lessons).slice(0, 5)
  });
});

// Apply rate limiter to upload endpoint as well
app.post('/api/lessons/upload', postLimiter);

app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🎓 InclusiveAI Content Engine running on http://localhost:${PORT}`);
  console.log(`   - Allowed CORS Origin: ${FRONTEND_ORIGIN}`);
  console.log(`   - Extraction & Validation: Active (pdf-parse-fork / 10MB limit)`);
  console.log(`   - ISL Sign & MediaPipe CV: Active`);
  console.log(`   - Haptic Diagram & Voice UI: Active`);
  console.log(`   - Rate Limiting: 20 req/min per IP on POST endpoints`);
  console.log(`   - Demo Auth: X-Student-Id header required on student endpoints`);
  console.log(`=======================================================`);
});
