export * from './listening-data.mjs';
import {LISTENING_STATEMENTS as baseline,SOURCE_LINKS as baselineSources,LISTENING_META as baselineMeta,SOURCE_COVERAGE as baselineCoverage} from './listening-data.mjs';
import {REFRESH_STATEMENTS,REFRESH_SOURCES} from './listening-refresh.mjs';
import {guardStatements} from './statement-quality.mjs';
export const SOURCE_LINKS=Object.freeze({...baselineSources,...REFRESH_SOURCES});
export const STATEMENT_QUALITY=guardStatements([...baseline,...REFRESH_STATEMENTS],SOURCE_LINKS);
export const LISTENING_STATEMENTS=Object.freeze(STATEMENT_QUALITY.statements);
export const sourceLink=label=>SOURCE_LINKS[label]||null;
export function statementAttributionLabel(record){
  const labels={
    COAUTHORED_CASE_REPORT:'Co-Authored Case Report',
    NAMED_CLINICIAN_CREDIT_IN_HOSPITAL_ARTICLE:'Hospital Article: Clinician Credit',
    CLINICIAN_AUTHORED_COMMENTARY:'Clinician-Authored Commentary',
    CLINICIAN_REMARKS_IN_HOSPITAL_ARTICLE:'Hospital Article: Attributed Remarks',
    SEARCH_INDEXED_AUTHOR_ATTRIBUTION:'Search-Indexed Author Attribution',
    PUBLIC_SOCIAL_CASE_DISCUSSION:'Public Social Case Discussion',
    ATTRIBUTED_CLINICAL_REFLECTION:'Attributed Clinical Reflection',
    ATTRIBUTED_QUOTATION_PARAPHRASE:'Attributed Remarks',
    NAMED_EXPERT_INPUT:'Named Expert Contribution',
    REPORTED_ADVICE:'Reported Advice'
  };
  return Object.hasOwn(labels,record?.attributionType)?labels[record.attributionType]:null;
}
export const SOURCE_COVERAGE=Object.freeze(baselineCoverage.map(group=>({...group,rows:group.rows.map(row=>row[0]==='LinkedIn'?['LinkedIn','PARTIAL','One cohort-linked article captured from search-indexed text on 30 September 2026. Direct profile access returned HTTP 999. Account control and engagement metrics remain unverified.',null]:row)})));
export function sponsorshipDisclosure(record){
  const source=typeof record==='string'?sourceLink(record):record?.sourceEvidence||sourceLink(record?.source);
  const value=(typeof record==='object'?record?.sponsorship:null)||source?.sponsorship;
  return typeof value==='string'?value.trim():'';
}
export const LISTENING_META=Object.freeze({...baselineMeta,updated:'30 Sep 2026',sourceLinksStatus:'Source-checked report plus public-source refresh. Collection is incomplete; this is not live monitoring.'});
