import { object } from './process.mjs';
const suffix=['--site','coderabbit-demo.atlassian.net','--output','json','--output-summary','none'];
const prefix=['jira','workitem'];
const keyPattern=/^SC-[1-9][0-9]*$/;
export class Jira {
  constructor(invoke) { this.invoke=invoke; }
  async metadata() {
    const o=object(await this.invoke([...prefix,'field','create-metadata','--space','SC','--type','Bug',...suffix]),'jira.workitem.field.create-metadata');
    if (!Array.isArray(o.data?.fields) || o.data.fields.some(f=>f.required === true)) throw new Error('required create field unresolved');
  }
  async get(key, id, marker) {
    if (!keyPattern.test(key) || !/^\d+$/.test(id) || !/^deskdrop-bridge-[a-f0-9]{64}$/.test(marker)) throw new Error('invalid jira identity');
    const o=object(await this.invoke([...prefix,'get',key,'--fields','summary,issuetype,status,project,labels,description',...suffix]),'jira.workitem.get');
    const a=o.meta?.acquisition; const coverage=o.meta?.evidence;
    if (!Array.isArray(o.data) || o.data.length!==1 || a?.requested!==1 || a.returned!==1 || a.succeeded!==1 || a.failed!==0 || a.omitted!==0 || a.truncated!==0 || coverage?.coverage?.status!=='complete' || coverage?.truncation?.truncated!==false) throw new Error('incomplete jira read');
    const x=o.data[0];
    if (x.key!==key || typeof x.id!=='string' || x.id!==id || x.project?.key!=='SC' || x.project?.id!=='10107' || x.issuetype?.name!=='Bug' || x.issuetype?.id!=='10047' || !Array.isArray(x.labels) || !x.labels.includes(marker) || !x.summary || !x.status?.name) throw new Error('jira readback mismatch');
    return {key,id,url:`https://coderabbit-demo.atlassian.net/browse/${key}`};
  }
  async lookup(marker) {
    if (!/^deskdrop-bridge-[a-f0-9]{64}$/.test(marker)) throw new Error('invalid marker');
    const jql=`project = SC AND issuetype = Bug AND labels = "${marker}" ORDER BY key ASC`;
    const o=object(await this.invoke([...prefix,'query','--jql',jql,'--fields','summary,issuetype,status,project,labels','--first','2',...suffix]),'jira.workitem.query');
    if (!Array.isArray(o.data?.issues) || o.data.issues.length>1 || o.meta?.acquisition?.truncated || o.meta?.evidence?.truncation?.truncated) throw new Error('jira lookup ambiguous');
    const x=o.data.issues[0];
    if (!x) return null;
    if (!keyPattern.test(x.key || '') || !/^\d+$/.test(String(x.id))) throw new Error('invalid lookup result');
    return this.get(x.key,String(x.id),marker);
  }
  async create(incident) {
    const marker=`deskdrop-bridge-${incident.episode}`;
    if (!/^deskdrop-bridge-[a-f0-9]{64}$/.test(marker) || !/^\d+$/.test(incident.monitor)) throw new Error('invalid create identity');
    const summary=`${incident.synthetic ? '[TEST synthetic]' : '[Unverified alert]'} DeskDrop monitor ${incident.monitor}`;
    const description=`Bridge episode ${marker}. This alert does not establish a product fault.`;
    const result=await this.invoke([...prefix,'create','--space','SC','--type','Bug','--summary',summary,'--description',description,'--description-format','plain','--labels',marker,...suffix]);
    if (result.kind==='prestart') return {kind:'prestart'};
    try {
      const o=object(result,'jira.workitem.create'), issue=o.data?.issue;
      if (o.data?.success!==true || typeof issue?.id!=='string' || !/^\d+$/.test(issue.id) || !keyPattern.test(issue.key || '')) throw new Error();
      return {kind:'known',id:issue.id,key:issue.key};
    } catch { return {kind:'unknown'}; }
  }
}
