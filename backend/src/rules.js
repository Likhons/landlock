// Rules engine: every check returns a level (red/yellow/green) and a reason in Bangla + English.
const RED = 'red', YELLOW = 'yellow', GREEN = 'green';

// A registered deed whose mutation the AC Land Officer rejected. The plot stays locked: neither the old
// owner nor the deed buyer can sell or mortgage it until the dispute is resolved outside the prototype.
const disputedReason = (tx) => ({
  level: RED, code: 'PLOT_DISPUTED',
  bn: tx
    ? `বিরোধপূর্ণ জমি: দলিল ${tx.deed_no} (${tx.seller} → ${tx.buyer}) নিবন্ধিত হয়েছে, কিন্তু এসি ল্যান্ড অফিসার নামজারি বাতিল করেছেন। কারণ: ${tx.dispute_reason}। বিরোধ নিষ্পত্তি না হওয়া পর্যন্ত বিক্রয় বা বন্ধক করা যাবে না। (এটি সতর্কতা, প্রতারণার প্রমাণ নয়।)`
    : 'এই জমি বিরোধপূর্ণ (নামজারি বাতিল হয়েছে)। বিরোধ নিষ্পত্তি না হওয়া পর্যন্ত বিক্রয় বা বন্ধক করা যাবে না।',
  en: tx
    ? `Disputed plot: deed ${tx.deed_no} (${tx.seller} → ${tx.buyer}) was registered, but the AC Land Officer rejected the mutation. Reason: ${tx.dispute_reason}. No sale or mortgage is allowed until the dispute is resolved. (This is a warning, not proof of fraud.)`
    : 'This plot is disputed (mutation was rejected). No sale or mortgage is allowed until the dispute is resolved.',
});

// Prototype rule: only the WHOLE plot can be sold. A smaller deed area would need the plot to be
// split (subdivision), which is not built yet; without it the mutation would wrongly give the buyer
// the whole plot. Returns null for a full-plot sale. (A larger area is AREA_EXCEEDS in checkSale.)
function partialSale(plot, deedArea) {
  if (!(Number(deedArea) < plot.area)) return null;
  return {
    code: 'PARTIAL_SALE_NOT_SUPPORTED',
    bn: `আংশিক বিক্রয় এই প্রোটোটাইপে সমর্থিত নয়। দলিলের পরিমাণ (${deedArea} শতক) খতিয়ানের পুরো পরিমাণের (${plot.area} শতক) সমান হতে হবে। জমি ভাগ (subdivision) পরের সংস্করণে আসবে।`,
    en: `Partial sales are not supported in this prototype. The deed area (${deedArea}) must equal the full recorded plot area (${plot.area}). Plot subdivision may come in a future version.`,
  };
}

// ---- Registration vs mutation: Sub-Registry deed record vs khatian (AC Land record) ----
// plot.registry = the latest registered deed for this plot (sample record imported from the
// Sub-Registry office, or the deed registered through LandLock). The khatian is the plot itself.
// The comparison only runs on a Free plot: a LandLock sale in progress (Pending) or a rejected
// mutation (Disputed) already explains a difference and has its own reason.
const registryOwnerMismatch = (plot) => Boolean(plot.registry && plot.status === 'Free' && plot.registry.buyer !== plot.current_owner);
const registryAreaMismatch = (plot) => Boolean(plot.registry && plot.registry.area !== plot.area);

function registryOwnerReason(plot, forAction) {
  const r = plot.registry;
  return {
    level: RED, code: 'REGISTRY_OWNER_MISMATCH',
    bn: `সাব-রেজিস্ট্রি অফিসের সর্বশেষ দলিল (${r.deed_no}) অনুযায়ী জমিটি ${r.seller}-এর কাছ থেকে ${r.buyer} কিনেছেন, কিন্তু খতিয়ানে এখনও মালিক ${plot.current_owner}। দলিল হয়েছে কিন্তু নামজারি হয়নি, অথবা কোনো রেকর্ডে ভুল আছে।`
      + (forAction ? ' এসি ল্যান্ড অফিসার রেকর্ড না মিলানো পর্যন্ত বিক্রয় বা বন্ধক করা যাবে না।' : ' রেকর্ড না মিলানো পর্যন্ত বিক্রয় ও বন্ধক বন্ধ থাকবে।')
      + ' (এটি অমিল, প্রতারণার প্রমাণ নয়।)',
    en: `The latest Sub-Registry deed (${r.deed_no}) says ${r.buyer} bought this plot from ${r.seller}, but the khatian still shows ${plot.current_owner} as owner. The deed was registered but mutation was not done, or one record is wrong.`
      + (forAction ? ' No sale or mortgage until the AC Land Officer reconciles the records.' : ' Sales and mortgages are blocked until the records are reconciled.')
      + ' (This is a mismatch, not proof of fraud.)',
  };
}

function registryAreaReason(plot) {
  const r = plot.registry;
  return {
    level: YELLOW, code: 'REGISTRY_AREA_MISMATCH',
    bn: `দলিলে (${r.deed_no}) জমির পরিমাণ ${r.area} শতক, কিন্তু খতিয়ানে ${plot.area} শতক। পরিমাপ ও রেকর্ড যাচাই প্রয়োজন। (এটি অমিল, প্রতারণার প্রমাণ নয়।)`,
    en: `The deed (${r.deed_no}) records ${r.area} decimal, but the khatian records ${plot.area} decimal. The measurement and records need checking. (This is a mismatch, not proof of fraud.)`,
  };
}

// Deed numbers are compared without spaces/case, so "d-1" and " D-1 " count as the same deed.
const normDeed = (v) => String(v).trim().toUpperCase();

// Checks run when someone tries to START a sale on a plot.
// buyer and usedDeedNos are optional so callers that only check the plot still work.
function checkSale(plot, seller, deedArea, { buyer, deedNo, usedDeedNos = [] } = {}) {
  const reasons = [];

  if (plot.status === 'Pending') {
    reasons.push({
      level: RED, code: 'PLOT_LOCKED',
      bn: 'এই জমিতে আগেই একটি বিক্রয় চলছে। নতুন বিক্রয় বা বন্ধক নিবন্ধন করা যাবে না।',
      en: 'A sale is already in progress on this plot. No new sale or mortgage can be registered.',
    });
  }
  if (plot.status === 'Disputed') reasons.push(disputedReason());
  if (registryOwnerMismatch(plot)) reasons.push(registryOwnerReason(plot, true));
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
  if (buyer !== undefined && buyer === seller) {
    reasons.push({
      level: RED, code: 'SAME_PARTY',
      bn: `ক্রেতা ও বিক্রেতা একই ব্যক্তি (${seller})। নিজের কাছে নিজের জমি বিক্রয় করা যায় না।`,
      en: `Buyer and seller are the same person (${seller}). A plot cannot be sold to its own owner.`,
    });
  }
  if (deedNo !== undefined && usedDeedNos.map(normDeed).includes(normDeed(deedNo))) {
    reasons.push({
      level: RED, code: 'DUPLICATE_DEED',
      bn: `দলিল নং ${deedNo} আগেই অন্য একটি লেনদেনে ব্যবহার হয়েছে। একই দলিল নম্বর দুইবার ব্যবহার করা যায় না।`,
      en: `Deed no. ${deedNo} is already used by another transaction. The same deed number cannot be used twice.`,
    });
  }

  // Every check that was actually run above, with passed = "its blocking reason was not raised".
  // Optional checks (buyer, deed no.) are listed only when they ran.
  const failed = (code) => reasons.some((r) => r.code === code);
  const checks = [
    { code: 'NO_PENDING_SALE', passed: !failed('PLOT_LOCKED'), bn: 'এই জমিতে অন্য কোনো বিক্রয় চলছে না (লক নেই)', en: 'No other sale is in progress on this plot (not locked)' },
    { code: 'NOT_DISPUTED', passed: !failed('PLOT_DISPUTED'), bn: 'জমিটি বিরোধপূর্ণ নয়', en: 'The plot is not disputed' },
    { code: 'NO_MORTGAGE', passed: !failed('PLOT_MORTGAGED'), bn: 'জমিতে কোনো চলমান বন্ধক নেই', en: 'No active mortgage on this plot' },
    {
      code: 'OWNER_MATCH', passed: !failed('NOT_OWNER'),
      bn: `বিক্রেতা (${seller}) রেকর্ডের বর্তমান মালিকের (${plot.current_owner}) সাথে মিলেছে`,
      en: `Seller (${seller}) matches the recorded current owner (${plot.current_owner})`,
    },
    {
      code: 'AREA_NOT_EXCEEDED', passed: !failed('AREA_EXCEEDS'),
      bn: `দলিলের পরিমাণ (${deedArea} শতক) খতিয়ানের পরিমাণের (${plot.area} শতক) চেয়ে বেশি নয়`,
      en: `Deed area (${deedArea}) is not larger than the recorded area (${plot.area})`,
    },
  ];
  if (buyer !== undefined) {
    checks.push({ code: 'DIFFERENT_PARTIES', passed: !failed('SAME_PARTY'), bn: 'ক্রেতা ও বিক্রেতা ভিন্ন ব্যক্তি', en: 'Buyer and seller are different people' });
  }
  if (plot.registry) {
    checks.push({
      code: 'REGISTRY_OWNER_MATCH', passed: !failed('REGISTRY_OWNER_MISMATCH'),
      bn: `সাব-রেজিস্ট্রি দলিল (${plot.registry.deed_no}) ও খতিয়ানের মালিক মিলেছে`,
      en: `Sub-Registry deed (${plot.registry.deed_no}) and khatian agree on the owner`,
    });
  }
  if (deedNo !== undefined) {
    checks.push({
      code: 'UNIQUE_DEED', passed: !failed('DUPLICATE_DEED'),
      bn: `দলিল নং ${deedNo} আগে কোনো লেনদেনে ব্যবহার হয়নি`, en: `Deed no. ${deedNo} has not been used by another transaction`,
    });
  }

  const level = reasons.some((r) => r.level === RED) ? RED : GREEN;
  return { level, reasons, allowed: level !== RED, checks };
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
  if (plot.status === 'Disputed') reasons.push(disputedReason());
  if (registryOwnerMismatch(plot)) reasons.push(registryOwnerReason(plot, true));
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
function assessPlot(plot, activeTx, ledgerStatus, disputedTx) {
  const reasons = [];

  if (!ledgerStatus.valid) {
    reasons.push({
      level: RED, code: 'LEDGER_TAMPERED',
      bn: 'সতর্কতা: রেকর্ডের ইতিহাসে পরিবর্তন ধরা পড়েছে। এই তথ্য বিশ্বাসযোগ্য নয়।',
      en: 'Warning: tampering detected in the record history. Data cannot be trusted.',
    });
  }

  if (plot.status === 'Disputed') reasons.push(disputedReason(disputedTx));

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

  if (registryOwnerMismatch(plot)) reasons.push(registryOwnerReason(plot, false));
  if (registryAreaMismatch(plot)) reasons.push(registryAreaReason(plot));

  reasons.push(...checkSurveyChain(plot));

  // Green only means none of the configured checks raised a warning. It is not a safety guarantee.
  if (reasons.length === 0) {
    reasons.push({
      level: GREEN, code: 'CLEAR',
      bn: 'কোনো সতর্কতা পাওয়া যায়নি। এই প্রোটোটাইপের নির্ধারিত যাচাইগুলোতে কোনো সমস্যা ধরা পড়েনি।',
      en: 'No warnings found. None of this prototype\'s configured checks found a problem.',
    });
  }

  const level = reasons.some((r) => r.level === RED) ? RED
    : reasons.some((r) => r.level === YELLOW) ? YELLOW : GREEN;
  return { level, reasons, notice: RESULT_NOTICE };
}

// Shown with every risk result and accepted sale
const RESULT_NOTICE = {
  bn: 'এই প্রোটোটাইপ শুধু নমুনা রেকর্ডের ভিত্তিতে নির্দিষ্ট কিছু নিয়ম যাচাই করে। এটি আইনগত মালিকানার নিশ্চয়তা দেয় না এবং জমিটি প্রতারণামুক্ত তা প্রমাণ করে না।',
  en: 'This prototype only checks a fixed set of rules against sample records. It does not guarantee legal ownership or prove that a plot is fraud-free.',
};

// Things a sale acceptance does NOT check, listed so nobody reads "accepted" as "verified"
const NOT_CHECKED = [
  {
    code: 'SELLER_IDENTITY',
    bn: 'বিক্রেতার পরিচয় (যেমন NID) যাচাই করা হয় না; শুধু নাম রেকর্ডের সাথে মেলানো হয়।',
    en: 'Seller identity (e.g. NID) is not verified; only the name is compared with the record.',
  },
  {
    code: 'LEGAL_TITLE',
    bn: 'আইনগত মালিকানা যাচাই করা হয় না; শুধু LandLock-এর নমুনা রেকর্ড দেখা হয়।',
    en: 'Legal title is not verified; only LandLock\'s own sample records are checked.',
  },
];

module.exports = { checkSale, checkMortgage, assessPlot, partialSale, registryOwnerMismatch, RESULT_NOTICE, NOT_CHECKED };