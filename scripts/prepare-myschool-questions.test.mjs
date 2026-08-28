import assert from "node:assert/strict";
import { meaningfulExplanation, prepareCollection } from "./prepare-myschool-questions.mjs";

assert.equal(meaningfulExplanation("No explanation available"), null);
assert.equal(meaningfulExplanation("  A useful explanation.  "), "A useful explanation.");

const base = {
  id: "myschool-physics-1",
  source: "myschool",
  source_url: "https://myschool.ng/classroom/physics/1",
  subject: "physics",
  exam_type: "jamb",
  year: 2000,
  question: "The diagram above shows a circuit.",
  question_image_urls: [],
  options: [
    { label: "A", text: "1 A", image_urls: [] },
    { label: "B", text: "2 A", image_urls: [] },
  ],
  correct_option: "B",
  correct_index: 1,
  explanation: "No explanation available",
  explanation_image_urls: [],
  quality_flags: ["missing_explanation"],
};

{
  const { prepared, queue } = prepareCollection({ source: "myschool", subject: "physics", exam_type: "jamb", questions: [base, { ...base, id: "duplicate" }] });
  assert.equal(prepared.questions.length, 1);
  assert.equal(prepared.quality.duplicates_removed, 1);
  assert.equal(prepared.quality.missing_explanations, 1);
  assert.equal(prepared.quality.missing_visual_media, 1);
  assert.equal(queue.total, 1);
  assert.equal(queue.questions[0].correct_answer, "2 A");
  console.log("PASS preparation removes duplicates and creates a guarded review queue");
}

{
  const reviewed = { entries: {
    [base.id]: {
      explanation: "Applying the circuit law gives a current of 1 A, so the independently checked answer is option A.",
      reviewed_by: "Physics editorial engine",
      reviewed_at: "2026-08-27T00:00:00Z",
      corrected_index: 0,
      answer_change_reason: "The supplied voltage and resistance give 1 A by Ohm's law.",
    },
  } };
  const { prepared } = prepareCollection({ source: "myschool", subject: "physics", exam_type: "jamb", questions: [base] }, reviewed);
  assert.equal(prepared.questions[0].correct_index, 0);
  assert.equal(prepared.questions[0].correct_option, "A");
  assert.equal(prepared.quality.corrected_answers, 1);
  console.log("PASS independently verified answer corrections retain an editorial audit trail");
}

{
  const reviewed = {
    [base.id]: {
      explanation: "Using Ohm's law, divide the potential difference by resistance to obtain 2 A, which is option B.",
      reviewed_by: "Physics editor",
      reviewed_at: "2026-08-27T00:00:00Z",
    },
  };
  const { prepared, queue } = prepareCollection({ source: "myschool", subject: "physics", exam_type: "jamb", questions: [base] }, reviewed);
  assert.equal(prepared.questions[0].explanation_status, "reviewed");
  assert.equal(prepared.questions[0].explanation_source, "seomtorch_editorial");
  assert.equal(queue.total, 0);
  console.log("PASS only attributed reviewed explanations are merged into the prepared bank");
}
