/**
 * Lesson Builder Service (P2-2)
 *
 * Extracted from the 70-line inline block in the /api/lessons/upload handler.
 * Constructs the full lesson object (islModule + bviModule) from the processed
 * content engine output + optional request body params.
 */

export function buildFullLesson(processed, bodyParams = {}) {
  return {
    ...processed,
    subject: bodyParams.subject || 'Class 10 Science',
    grade: bodyParams.grade || 'Grade 10',
    estimatedTime: '12 mins',
    summary: processed.text_blocks[0] || 'Lesson overview.',
    uploadedAt: new Date().toISOString(),
    originalFileName: processed.originalFileName,
    islModule: {
      lessonGlosses: processed.concepts.map(c => ({
        word: c.word,
        gloss: c.gloss || c.word.toUpperCase(),
        description: c.description || `Sign gesture for ${c.word}`,
        duration: 2.5
      })),
      practiceWords: processed.concepts.slice(0, 3).map(c => ({
        id: c.word.toLowerCase(),
        word: c.word,
        hint: c.description || `Perform the sign for ${c.word}.`,
        targetPose: 'SIGN_POSE',
        difficulty: 'Easy'
      })),
      quiz: processed.quiz_items.map((q, idx) => ({
        id: `q-isl-${idx}`,
        question: q.prompt,
        options: ["Primary core concept", "Secondary mechanism", "Unrelated function", "Incorrect premise"],
        correctIndex: 0,
        signHint: `Focus on ${q.prompt}`
      }))
    },
    bviModule: {
      audioSummary: processed.text_blocks.join(' ').slice(0, 200),
      audioSections: processed.text_blocks.map((b, i) => ({
        sectionTitle: `Section ${i + 1}`,
        content: b
      })),
      hapticDiagram: {
        id: processed.diagrams[0]?.id || 'diagram-main',
        title: processed.diagrams[0]?.label || 'Diagram',
        aspectRatio: "4:3",
        viewBox: { width: 800, height: 600 },
        paths: [
          {
            id: "outer-boundary",
            name: "Diagram Outline Boundary",
            type: "boundary",
            d: "M 400,120 C 520,70 660,160 640,320 C 620,440 460,530 400,560 C 340,530 180,440 160,320 C 140,160 280,70 400,120 Z",
            vibrationPattern: [40, 20]
          }
        ],
        landmarks: (processed.diagrams[0]?.regions || []).map(r => ({
          id: r.id,
          name: r.label,
          x: Math.round(r.x * 800),
          y: Math.round(r.y * 600),
          radius: Math.round((r.radius || 0.08) * 800),
          audioDescription: r.description || `You are touching ${r.label}.`,
          hapticTone: [100, 50, 100],
          color: "#FFFFFF"
        }))
      },
      voiceQuiz: processed.quiz_items.map(q => ({
        id: q.id,
        spokenQuestion: q.spokenQuestion,
        expectedKeywords: q.acceptedAnswerKeywords,
        modelAnswer: q.modelAnswer,
        points: 10
      }))
    }
  };
}
