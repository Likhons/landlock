// Rules engine: every check returns a level (red/yellow/green) and a reason in Bangla + English.
const RED = 'red', YELLOW = 'yellow', GREEN = 'green';

// Checks run when someone tries to START a sale on a plot.
function checkSale(plot, seller, deedArea) {
  const reasons = [];

  if (plot.status === 'Pending') {
    reasons.push({
      level: RED, code: 'PLOT_LOCKED',
      bn: 'এই জমিতে আগেই একটি বিক্রয় চলছে। নতুন বিক্রয় বা বন্ধক নিবন্ধন করা যাবে না।',
      en: 'A sale is already in progress on this plot. No new sale or mortgage can be registered.',
    });
  }
  if (plot.mortgage) {
    reasons.push({
      level: RED, code: 'PLOT_MORTGAGED',
      bn: `এই জমি ${plot.mortgage.bank}-এ বন্ধক আছে (ঋণ নং ${plot.mortgage.loan_ref})। বন্ধক মুক্ত না হলে বিক্রয় নিবন্ধন করা যাবে না।`,
      en: `This plot is mortgaged to ${plot.mortgage.bank} (loan ${plot.mortgage.loan_ref}). It cannot be sold until the mortgage is released.`,
    });
  }
  if (plot.current_owner !== seller) {
    reasons.push({
      level: RED, code: 'NOT_OWNER',
      bn: `বিক্রেতা (${seller}) রেকর্ড অনুযায়ী এই জমির মালিক নন। বর্তমান মালিক: ${plot.current_owner}।`,
      en: `Seller (${seller}) is not the recorded owner. Current owner: ${plot.current_owner}.`,
    });
  }
  if (Number(deedArea) > plot.area) {
    reasons.push({
      level: RED, code: 'AREA_EXCEEDS',
      bn: `দলিলের জমির পরিমাণ (${deedArea} শতক) খতিয়ানের পরিমাণের (${plot.area} শতক) চেয়ে বেশি।`,
      en: `Deed area (${deedArea}) exceeds khatian area (${plot.area}).`,
    });
  }

  const level = reasons.some((r) => r.level === RED) ? RED : GREEN;
  return { level, reasons, allowed: level !== RED };
}

// Checks run when a bank tries to register a MORTGAGE on a plot.
function checkMortgage(plot, owner, bank) {
  const reasons = [];
  if (plot.status === 'Pending') {
    reasons.push({
      level: RED, code: 'SALE_IN_PROGRESS',
      bn: 'এই জমির বিক্রয় চলছে। এখন বন্ধক নিবন্ধন করা যাবে না।',
      en: 'A sale is in progress on this plot. A mortgage cannot be registered now.',
    });
  }
  if (plot.mortgage) {
    reasons.push({
      level: RED, code: 'DOUBLE_MORTGAGE',
      bn: `এই জমি ইতিমধ্যে ${plot.mortgage.bank}-এ বন্ধক আছে। দ্বিতীয়বার বন্ধক রাখা যাবে না (${bank}-এর ঋণ আটকানো হলো)।`,
      en: `This plot is already mortgaged to ${plot.mortgage.bank}. Double mortgage blocked for ${bank}.`,
    });
  }
  if (plot.current_owner !== owner) {
    reasons.push({
      level: RED, code: 'NOT_OWNER',
      bn: `বন্ধকদাতা (${owner}) রেকর্ড অনুযায়ী এই জমির মালিক নন। বর্তমান মালিক: ${plot.current_owner}।`,
      en: `Mortgagor (${owner}) is not the recorded owner. Current owner: ${plot.current_owner}.`,
    });
  }
  const level = reasons.length ? RED : GREEN;
  return { level, reasons, allowed: !reasons.length };
}

// Survey chain (CS -> SA -> RS -> BS): flags changes that have no supporting record.
// These are warnings (Yellow), never blocks: an unexplained change needs checking, it is not proof of fraud.
const EXPLAINED = ['sale', 'inheritance', 'court', 'gift'];
function checkSurveyChain(plot) {
  const reasons = [];
  const chain = plot.survey || [];
  for (let i = 1; i < chain.length; i++) {
    const prev = chain[i - 1];
    const cur = chain[i];
    if (cur.owner !== prev.owner && !EXPLAINED.includes(cur.source)) {
      reasons.push({
        level: YELLOW, code: 'UNEXPLAINED_CHANGE',
        bn: `${prev.survey} থেকে ${cur.survey} জরিপে মালিক ${prev.owner} থেকে ${cur.owner} হয়েছে, কিন্তু দলিল বা উত্তরাধিকারের কোনো প্রমাণ রেকর্ডে নেই। যাচাই প্রয়োজন।`,
        en: `Owner changed from ${prev.owner} (${prev.survey}) to ${cur.owner} (${cur.survey}) with no supporting deed or inheritance record. Needs verification.`,
      });
    }
    if (cur.area > prev.area) {
      reasons.push({
        level: YELLOW, code: 'AREA_INCREASED',
        bn: `${prev.survey} থেকে ${cur.survey} জরিপে জমির পরিমাণ ${prev.area} থেকে বেড়ে ${cur.area} শতক হয়েছে। কারণ রেকর্ডে নেই। যাচাই প্রয়োজন।`,
        en: `Area grew from ${prev.area} (${prev.survey}) to ${cur.area} (${cur.survey}) with no recorded reason. Needs verification.`,
      });
    }
  }
  return reasons;
}

// Overall status of a plot, shown on the "check before you buy" page.
function assessPlot(plot, activeTx, ledgerStatus) {
  const reasons = [];

  if (!ledgerStatus.valid) {
    reasons.push({
      level: RED, code: 'LEDGER_TAMPERED',
      bn: 'সতর্কতা: রেকর্ডের ইতিহাসে পরিবর্তন ধরা পড়েছে। এই তথ্য বিশ্বাসযোগ্য নয়।',
      en: 'Warning: tampering detected in the record history. Data cannot be trusted.',
    });
  }

  if (plot.status === 'Pending' && activeTx) {
    if (activeTx.reg_status === 'done' && activeTx.mutation_status !== 'done') {
      reasons.push({
        level: YELLOW, code: 'REG_NOT_MUTATED',
        bn: `দলিল নিবন্ধিত হয়েছে (${activeTx.seller} → ${activeTx.buyer}), কিন্তু খতিয়ানে নাম পরিবর্তন (নামজারি) এখনও হয়নি। রেকর্ডে এখনও ${plot.current_owner} মালিক।`,
        en: `Deed registered (${activeTx.seller} → ${activeTx.buyer}) but mutation is pending. Record still shows ${plot.current_owner}.`,
      });
    } else {
      reasons.push({
        level: YELLOW, code: 'SALE_IN_PROGRESS',
        bn: `এই জমির একটি বিক্রয় প্রক্রিয়াধীন (${activeTx.seller} → ${activeTx.buyer})। এখন কেনা ঝুঁকিপূর্ণ।`,
        en: `A sale is in progress (${activeTx.seller} → ${activeTx.buyer}). Buying now is risky.`,
      });
    }
  }

  if (plot.mortgage) {
    reasons.push({
      level: YELLOW, code: 'MORTGAGED',
      bn: `জমিটি ${plot.mortgage.bank}-এ বন্ধক আছে (ঋণ নং ${plot.mortgage.loan_ref})। কেনার আগে বন্ধক মুক্তির প্রমাণ নিন।`,
      en: `Plot is mortgaged to ${plot.mortgage.bank} (loan ${plot.mortgage.loan_ref}). Get proof of release before buying.`,
    });
  }

  reasons.push(...checkSurveyChain(plot));

  if (reasons.length === 0) {
    reasons.push({
      level: GREEN, code: 'CLEAR',
      bn: 'কোনো সমস্যা পাওয়া যায়নি। রেকর্ড অনুযায়ী জমিটি মুক্ত।',
      en: 'No issues found. The plot is free in the records.',
    });
  }

  const level = reasons.some((r) => r.level === RED) ? RED
    : reasons.some((r) => r.level === YELLOW) ? YELLOW : GREEN;
  return { level, reasons };
}

module.exports = { checkSale, checkMortgage, assessPlot };