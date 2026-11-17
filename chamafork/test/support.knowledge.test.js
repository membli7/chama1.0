const assert = require("node:assert/strict");
const { test } = require("node:test");
const { processAiChat } = require("../support-service");

test("answers loan questions from current knowledge without a universal share multiplier", () => {
  const response = processAiChat("How much can I borrow?", {
    settings: { loanMonthlyRatePercent: 7 },
    loanPolicy: {
      maxGroupCashPercent: 80,
      maxMemberContributionPercent: 125,
      tiers: [{ maxAmountKsh: 50000, minActiveDays: 30, minShareContributionKsh: 1000 }],
    },
  });

  assert.equal(response.language, "en");
  assert.match(response.reply, /no universal eligibility threshold/i);
  assert.match(response.reply, /two different active Chama members/i);
  assert.match(response.reply, /7%/);
  assert.match(response.reply, /Group-balance cap: 80%/);
  assert.match(response.reply, /up to KES 50000; at least 30 active-membership days and KES 1000/);
  assert.doesNotMatch(response.reply, /3 times your share capital/i);
});

test("answers a Kiswahili loan question in Kiswahili using the supplied Chama rate", () => {
  const response = processAiChat("Ninawezaje kuomba mkopo?", {
    settings: { loanMonthlyRatePercent: 8 },
    loanPolicy: {
      maxGroupCashPercent: 70,
      maxMemberContributionPercent: 110,
      tiers: [{ maxAmountKsh: 40000, minActiveDays: 20, minShareContributionKsh: 750 }],
    },
  });

  assert.equal(response.language, "sw");
  assert.match(response.reply, /Hakuna kigezo cha jumla/i);
  assert.match(response.reply, /wanachama hai wawili tofauti/i);
  assert.match(response.reply, /8%/);
  assert.match(response.reply, /Ukomo wa salio la chama: 70%/);
  assert.match(response.reply, /hadi KES 40000; angalau siku 20/);
  assert.doesNotMatch(response.reply, /There is no universal/i);
});

test("uses no guessed Chama amounts when live settings are absent", () => {
  const response = processAiChat("What is the monthly contribution and late penalty?");

  assert.match(response.reply, /date configured by your Chama/i);
  assert.match(response.reply, /amount configured by your Chama/i);
  assert.doesNotMatch(response.reply, /KES \d+/);
});

test("does not answer an unrelated personal-balance question with a loosely matching FAQ", () => {
  const response = processAiChat("What is my share balance?", {}, {
    faqs: [{ question: "How do I request a loan?", answer: "A loan FAQ answer." }],
  });

  assert.match(response.reply, /I don't have a reliable answer/i);
  assert.doesNotMatch(response.reply, /A loan FAQ answer/);
});

const bilingualExamples = [
  ["Kiswahili greeting", "Habari, naomba msaada", "sw", /Karibu kwenye msaada/i],
  ["English Chama registration", "Can I register a new Chama?", "en", /Register a New Chama/],
  ["Kiswahili Chama joining", "Nataka kujiunga na chama kwa msimbo wa mwaliko", "sw", /Kujiunga na chama kilichopo/],
  ["English meeting attendance", "How is meeting attendance tracked?", "en", /The Secretary creates and manages/i],
  ["Kiswahili dividends", "Gawio huhesabiwaje?", "sw", /Mwenyekiti au Mweka Hazina/i],
  ["Kiswahili elections", "Uchaguzi wa chama unaendaje?", "sw", /Mwenyekiti au Katibu/i],
  ["Kiswahili group chat", "Nataka gumzo la kikundi", "sw", /Wanachama walio hai/i],
  ["Kiswahili human support", "Nahitaji kuzungumza na mhudumu wa msaada", "sw", /Wasilisha ombi la msaada/i],
];

for (const [scenario, message, language, expectedText] of bilingualExamples) {
  test(`routes ${scenario} to the matching knowledge answer`, () => {
    const response = processAiChat(message);

    assert.equal(response.language, language);
    assert.match(response.reply, expectedText);
  });
}

test("does not present an English custom FAQ answer as Kiswahili", () => {
  const response = processAiChat("Ninawezaje kubadilisha jina la kikundi?", { language: "sw" }, {
    faqs: [{
      question: "Ninawezaje kubadilisha jina la kikundi?",
      answer: "This English answer must not be presented as a Kiswahili translation.",
    }],
  });

  assert.equal(response.language, "sw");
  assert.match(response.reply, /jibu lake linapatikana kwa Kiingereza pekee/i);
  assert.doesNotMatch(response.reply, /This English answer/);
});
