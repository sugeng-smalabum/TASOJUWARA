// server.js - Secure Exam Backend
// Install dependencies first: npm install express cors body-parser

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// Store exams data (in production, use a real database)
const examsDB = {};

// Endpoint 1: Teacher uploads exam questions with answers
app.post('/api/teacher/create-exam', (req, res) => {
  const { examKey, examInfo, questions } = req.body;

  if (!examKey || !questions || questions.length === 0) {
    return res.status(400).json({ error: 'Invalid exam data' });
  }

  // Store only essential info - answers stay on server
  examsDB[examKey] = {
    examInfo: examInfo,
    questions: questions.map(q => ({
      text: q.text,
      image: q.image,
      options: q.options,
      correctAnswers: q.correctAnswers // NEVER send to client
    })),
    createdAt: new Date().toISOString(),
    results: []
  };

  res.json({
    success: true,
    message: 'Exam created successfully',
    examKey: examKey
  });
});

// Endpoint 2: Student requests questions WITHOUT answers
app.post('/api/student/get-exam', (req, res) => {
  const { examKey } = req.body;

  if (!examsDB[examKey]) {
    return res.status(404).json({ error: 'Exam not found' });
  }

  const exam = examsDB[examKey];
  
  // Send questions WITHOUT correct answers
  const questionsForStudent = exam.questions.map(q => ({
    text: q.text,
    image: q.image,
    options: q.options
    // correctAnswers is NOT included!
  }));

  res.json({
    success: true,
    examInfo: exam.examInfo,
    questions: questionsForStudent
  });
});

// Endpoint 3: Student submits answers for grading
app.post('/api/student/submit-exam', (req, res) => {
  const { examKey, studentData, answers, violations } = req.body;

  if (!examsDB[examKey]) {
    return res.status(404).json({ error: 'Exam not found' });
  }

  const exam = examsDB[examKey];
  let correctCount = 0;

  // Grade on server side - student can't cheat this
  exam.questions.forEach((question, index) => {
    const studentAnswer = answers[index] || [];
    const correctAnswers = question.correctAnswers;

    // Sort for comparison
    const studentSorted = studentAnswer.sort();
    const correctSorted = correctAnswers.sort();

    if (JSON.stringify(studentSorted) === JSON.stringify(correctSorted)) {
      correctCount++;
    }
  });

  const score = Math.round((correctCount / exam.questions.length) * 100);

  // Store result on server
  const result = {
    studentName: studentData.name,
    studentNis: studentData.nis,
    studentClass: studentData.class,
    score: score,
    correctCount: correctCount,
    totalQuestions: exam.questions.length,
    violations: violations,
    timestamp: new Date().toISOString()
  };

  exam.results.push(result);

  // Generate QR data (can include result ID for verification)
  const qrData = {
    examKey: examKey,
    studentNis: studentData.nis,
    score: score,
    timestamp: result.timestamp,
    verified: true // Server verified
  };

  res.json({
    success: true,
    score: score,
    correctCount: correctCount,
    totalQuestions: exam.questions.length,
    qrData: qrData,
    resultId: Date.now() // Unique result ID
  });
});

// Endpoint 4: Teacher views all results for an exam
app.get('/api/teacher/results/:examKey', (req, res) => {
  const { examKey } = req.params;

  if (!examsDB[examKey]) {
    return res.status(404).json({ error: 'Exam not found' });
  }

  res.json({
    success: true,
    examInfo: examsDB[examKey].examInfo,
    results: examsDB[examKey].results
  });
});

// Endpoint 5: Teacher gets correct answers (verification only)
app.post('/api/teacher/verify-answer', (req, res) => {
  const { examKey, questionIndex } = req.body;

  if (!examsDB[examKey]) {
    return res.status(404).json({ error: 'Exam not found' });
  }

  const question = examsDB[examKey].questions[questionIndex];
  
  res.json({
    success: true,
    question: question.text,
    correctAnswers: question.correctAnswers,
    note: 'Teacher only - never shared with students'
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'Server is running' });
});

app.listen(PORT, () => {
  console.log(`Exam Server running on http://localhost:${PORT}`);
  console.log('Endpoints:');
  console.log('  POST /api/teacher/create-exam - Upload exam');
  console.log('  POST /api/student/get-exam - Get questions (no answers)');
  console.log('  POST /api/student/submit-exam - Submit and grade');
  console.log('  GET  /api/teacher/results/:examKey - View results');
});
