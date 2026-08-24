# 👥 InclusiveAI — 5-Member Team Development Plan & Git Branches

This document outlines the Git branch allocation and domain of responsibility for each of the 5 team members developing the **InclusiveAI Platform**.

---

## 🌿 Git Branches Overview

All branches have been created from the latest `main` branch with pre-configured dependencies and scripts:

```
main (Production Ready / Stable Code)
 ├── feature/member-1-backend-ai-engine
 ├── feature/member-2-dhh-module
 ├── feature/member-3-bvi-module
 ├── feature/member-4-ml-pipeline
 └── feature/member-5-teacher-dashboard
```

---

## 👨‍💻 Member Breakdown & Responsibility Matrix

### 👤 Member 1: Backend & AI Content Engine Developer
* **Git Branch:** `feature/member-1-backend-ai-engine`
* **Primary Directory:** `server/`
* **Core Responsibilities:**
  - Build and expand Node.js/Express API endpoints in `server/index.js` and `server/services/`.
  - Handle file ingestion (`pdf-parse-fork`, PPT, TXT uploads) and text chunking.
  - Implement concept detection, diagram vector extraction, and quiz generation logic.
  - Expose RESTful APIs for client components to consume standard lesson JSON data.

---

### 🤟 Member 2: Deaf & Hard-of-Hearing (DHH) Module Developer
* **Git Branch:** `feature/member-2-dhh-module`
* **Primary Directory:** `client/src/components/dhh/` (or dedicated DHH components)
* **Core Responsibilities:**
  - Build the Text-to-Indian Sign Language (ISL) playback interface and dictionary lookup.
  - Implement real-time camera gesture practice using `@mediapipe/hands` and `@mediapipe/camera_utils`.
  - Create the sign-to-text live translation bridge and gesture accuracy scoring UI.
  - Integrate interactive Deaf student quiz mode.

---

### 👁️ Member 3: Blind & Visually Impaired (BVI) Module Developer
* **Git Branch:** `feature/member-3-bvi-module`
* **Primary Directory:** `client/src/components/bvi/` (or dedicated BVI components)
* **Core Responsibilities:**
  - Develop context-aware Text-to-Speech (TTS) narration engine using Web Speech API.
  - Build the **Haptic Diagram Canvas** utilizing touch coordinates, audio callouts, and Web Vibration API (`navigator.vibrate`).
  - Implement hands-free voice navigation ("next page", "repeat", "start quiz").
  - Create the Voice Quiz interface with Speech-to-Text (STT) answer evaluation.

---

### 🧠 Member 4: Machine Learning & Computer Vision Engineer
* **Git Branch:** `feature/member-4-ml-pipeline`
* **Primary Directory:** `ml/` & `client/public/models/`
* **Core Responsibilities:**
  - Preprocess MediaPipe hand gesture landmark datasets in `ml/preprocessing/`.
  - Train and evaluate ISL landmark classification models in `ml/training/` and `ml/models/`.
  - Export trained models to `.onnx` format for browser execution.
  - Integrate web inference using `onnxruntime-web` in the client app.

---

### 👩‍🏫 Member 5: Teacher Dashboard & Shared UI/UX Lead
* **Git Branch:** `feature/member-5-teacher-dashboard`
* **Primary Directory:** `client/src/` (Teacher views, layout, components)
* **Core Responsibilities:**
  - Build the Teacher Upload Portal (Drag-and-drop PDF/PPT file uploader).
  - Create the Lesson Management interface and class analytics dashboard.
  - Maintain global UI design tokens, navigation header, accessible dark/light themes, and responsive CSS.
  - Oversee cross-module integration into the main application layout.

---

## 🔄 Recommended Git Workflow for Team Members

1. **Switch to your assigned branch:**
   ```bash
   git checkout feature/member-X-your-branch-name
   ```
2. **Start working on your module:**
   ```bash
   npm run dev
   ```
3. **Commit your changes frequently:**
   ```bash
   git add .
   git commit -m "feat(module): description of changes made"
   ```
4. **Merge updates from main periodically:**
   ```bash
   git fetch origin
   git merge main
   ```
