export const PD = 'Production/Dissemination';
export const OI = 'Operationalization/Implementation';

// Starting labels apply Caroline's framework to the original document TYPE.
// They are project coding, not World Bank metadata or completed human reviews.
export function classifyType(name, family) {
  if (!name) return {category:null, review:true, order:8, reason:'No document type recorded. These 184 documents have mixed earlier individual coding; no single category is assumed.'};
  const broad = new Set(['Report','Brief','Publication','Annual Report','Board Report','Funding Proposal','Environmental Action Plan','CAS Public Information Note','Poverty Reduction Strategy Paper (PRSP)','City Development Strategy (CDS)']);
  let category, order, reason;
  if (name === 'Systematic Country Diagnostic') {
    category=PD;order=2;reason='Country diagnostic: analytical/advisory transmission of the script; borderline case flagged for review.';
  } else if (name === 'City Development Strategy (CDS)') {
    category=OI;order=3;reason='A strategy rather than a general analytical study; check this boundary case.';
  } else if (family === 'Research and publications') {
    category=PD;order=0;reason='Research/publication: production and dissemination of the script.';
  } else if (family === 'Board and leadership statements') {
    category=PD;order=1;reason='Board/leadership statement: production and dissemination of the script.';
  } else if (family === 'Economic and sector work') {
    category=PD;order=2;reason='Economic/sector analytical and advisory work: production and dissemination in Caroline’s framework.';
  } else if (family.startsWith('Country strategy')) {
    category=OI;order=3;reason='Country strategy: operationalization and implementation in Caroline’s framework.';
  } else if (family === 'Environmental and social safeguards') {
    category=OI;order=5;reason='Project safeguards: operationalization and implementation.';
  } else if (family === 'Evaluation and accountability' || /Completion|Performance and Learning|Performance Assessment/.test(name)) {
    category=OI;order=6;reason='Evaluation/completion: operationalization and implementation.';
  } else if (family.startsWith('Project')) {
    category=OI;order=4;reason='Project design, appraisal, implementation or funding: operationalization and implementation.';
  } else {
    return {category:null,review:true,order:8,reason:'No confident starting rule; review required.'};
  }
  return {category, review:broad.has(name) || name === 'Systematic Country Diagnostic', order, reason};
}
