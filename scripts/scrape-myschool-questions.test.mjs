import assert from "node:assert/strict";
import { listingPageUrl, parseArgs, parseCollectionUrl, parseDetail, parseListing } from "./scrape-myschool-questions.mjs";

{
  const collection = parseCollectionUrl("https://www.myschool.ng/classroom/chemistry?exam_type=jamb&page=24");
  assert.deepEqual(collection, {
    key: "chemistry-jamb",
    subject: "chemistry",
    examType: "jamb",
    url: "https://myschool.ng/classroom/chemistry?exam_type=jamb",
    filters: { exam_type: "jamb" },
  });
  assert.equal(listingPageUrl(collection, 7), "https://myschool.ng/classroom/chemistry?exam_type=jamb&page=7");
  assert.throws(
    () => parseCollectionUrl("https://myschool.ng/classroom/chemistry/1234?exam_type=jamb"),
    /subject listing link/,
  );
  console.log("PASS collection parser derives subject and filters from a pasted URL");
}

{
  const config = parseArgs([
    "https://myschool.ng/classroom/mathematics?exam_type=jamb",
    "--url", "https://myschool.ng/classroom/government?exam_type=jamb",
  ]);
  assert.deepEqual(config.collections.map(collection => collection.key), ["mathematics-jamb", "government-jamb"]);
  console.log("PASS CLI accepts positional and repeated subject URLs");
}

{
  const html = `
    <a href="/classroom/physics/295?exam_type=jamb&amp;page=1">View Explanation</a>
    <a href="/classroom/physics/295?exam_type=jamb&amp;page=1">Duplicate link</a>
    <a href="/classroom/biology/287?exam_type=jamb">Wrong subject</a>
    <button>1</button><button>2</button><button>497</button>
  `;
  const result = parseListing(html, "physics", "https://myschool.ng/classroom/physics?exam_type=jamb");
  assert.deepEqual(result.urls, ["https://myschool.ng/classroom/physics/295?exam_type=jamb&page=1"]);
  assert.equal(result.totalPages, 497);
  console.log("PASS listing parser returns unique detail URLs and the final page");
}

{
  const html = `
    <main>
      <section>
        <div>
          <a href="/classroom/biology">Biology</a>
          <a href="/classroom/biology?exam_type=jamb&amp;exam_year=1978">JAMB 1978</a>
          <h1><p>A plant growing harmlessly on another plant is called?</p><img src="/media/question.png"></h1>
        </div>
        <div class="space-y-1">
          <div><div><span>A</span><p class="font-medium">a parasite</p></div></div>
          <div class="bg-[#DFFFEC]"><div><span>B</span><p class="font-medium">an epiphyte</p></div><svg></svg></div>
          <div><div><span>C</span><p class="font-medium">a saprophyte</p></div></div>
          <div><div><span>D</span><p class="font-medium">a predator</p></div></div>
        </div>
      </section>
      <section>
        <div><h4>Explanation</h4><div><span>Correct Option</span><span>B</span></div></div>
        <p class="text-tx_secondary">Epiphytes use the host for support without taking its nutrients.</p>
      </section>
    </main>
  `;
  const question = parseDetail(html, "biology", "https://myschool.ng/classroom/biology/287?exam_type=jamb", "jamb");
  assert.equal(question.correct_option, "B");
  assert.equal(question.correct_index, 1);
  assert.equal(question.year, 1978);
  assert.equal(question.exam_type, "jamb");
  assert.equal(question.explanation, "Epiphytes use the host for support without taking its nutrients.");
  assert.deepEqual(question.question_image_urls, ["https://myschool.ng/media/question.png"]);
  console.log("PASS detail parser keeps the answer, explanation, year and scoped images");
}
