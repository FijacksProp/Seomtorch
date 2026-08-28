import assert from "node:assert/strict";
import { buildPack } from "./build-myschool-pack.mjs";

const pack = buildPack({
  subject: "physics",
  questions: [
    { id: "ok", subject: "physics", question: "Usable?", options: [{ text: "Yes" }, { text: "No" }], correct_index: 0, year: 2020, question_image_files: ["assets\\questions\\diagram.png"], explanation_status: "missing", quality_flags: ["missing_explanation"] },
    { id: "visual", subject: "physics", question: "See diagram", options: [{ text: "A" }, { text: "B" }], correct_index: 1, quality_flags: ["missing_visual_media"] },
    { id: "ambiguous", subject: "physics", question: "Incomplete", options: [{ text: "A" }, { text: "B" }], correct_index: 1, quality_flags: ["editorial_excluded"] },
  ],
});

assert.equal(pack.questions.length, 1);
assert.equal(pack.questions[0].image_url, "assets/questions/diagram.png");
assert.equal(pack.questions[0].explanation, "");
assert.equal(pack.quality.excluded_questions, 2);
console.log("PASS deployable pack excludes unsafe visual questions and normalizes media paths");
