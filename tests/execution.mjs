import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const work=fs.mkdtempSync(path.join(os.tmpdir(),'bmad-gate-'));
const policy=JSON.parse(fs.readFileSync(path.join(root,'examples/export-policy.json')));
const leaf=(id,project='chromium')=>({title:id+' reference',file:'export.spec.ts',line:id==='AC-1'?1:2,column:1,
 tests:[{projectName:project,expectedStatus:'passed',status:'expected',results:[{status:'passed'}]}]});
const clean=()=>({config:{forbidOnly:true},errors:[],suites:[{title:'export',suites:[],specs:[leaf('AC-1'),leaf('AC-2')]}]});
let count=0;
function run(name,mutate,expected=false){
 const r=clean(),p=structuredClone(policy),ctx={runner:0};mutate(r,p,ctx);
 fs.writeFileSync(path.join(work,'policy.json'),JSON.stringify(p));
 fs.writeFileSync(path.join(work,'run.json'),typeof r.raw==='string'?r.raw:JSON.stringify(r));
 const out=spawnSync(process.execPath,[path.join(root,'gate-check.mjs'),path.join(work,'policy.json'),path.join(work,'run.json'),String(ctx.runner)],{encoding:'utf8'});
 assert.equal(out.status===0,expected,name+' '+out.stderr);count++;
}
try{
 run('clean required pairs',()=>{},true);
 run('nonzero runner',(r,p,c)=>c.runner=1);
 run('no suites',r=>r.suites=[]);
 run('missing required',r=>r.suites[0].specs.pop());
 run('missing project',r=>delete r.suites[0].specs[0].tests[0].projectName);
 run('wrong project',r=>r.suites[0].specs[0].tests[0].projectName='firefox');
 run('failed attempt',r=>r.suites[0].specs[0].tests[0].results[0].status='failed');
 run('interrupted attempt',r=>r.suites[0].specs[0].tests[0].results[0].status='interrupted');
 run('skipped required',r=>r.suites[0].specs[0].tests[0].results[0].status='skipped');
 run('flaky outcome',r=>r.suites[0].specs[0].tests[0].status='flaky');
 run('expected failure',r=>r.suites[0].specs[0].tests[0].expectedStatus='failed');
 run('global error',r=>r.errors=[{message:'reference failure'}]);
 run('forbidOnly absent',r=>delete r.config.forbidOnly);
 run('sharded report',r=>r.config.shard={current:1,total:2});
 run('duplicate definitions',r=>r.suites[0].specs.push({...leaf('AC-1'),line:99}));
 run('missing execution results',r=>r.suites[0].specs[0].tests[0].results=[]);
 run('empty required policy',(r,p)=>p.required=[]);
 run('duplicate scenario mapping',(r,p)=>p.required[1].id=p.required[0].id);
 run('duplicate native mapping',(r,p)=>p.required[1].testId=p.required[0].testId);
 run('required skip allowlist',(r,p)=>p.allowedSkips=['AC-1@chromium']);
 run('wrong repetition count',(r,p)=>p.repetitions=3);
 run('repeat three',(r,p)=>{p.repetitions=3;for(const s of r.suites[0].specs){s.tests.push(structuredClone(s.tests[0]),structuredClone(s.tests[0]));}},true);
 run('support test passes',r=>r.suites[0].specs.push(leaf('support')),true);
 run('unapproved scaffold',r=>{const x=leaf('AC-6');x.tests[0].results=[{status:'skipped'}];r.suites[0].specs.push(x);});
 run('approved out-of-scope scaffold',(r,p)=>{const x=leaf('AC-6');x.tests[0].results=[{status:'skipped'}];r.suites[0].specs.push(x);p.allowedSkips=['AC-6@chromium'];},true);
 run('malformed JSON',r=>r.raw='{');
 console.log(JSON.stringify({executionControls:count,allPassed:true,scope:'synthetic runner reports; no application run'}));
}finally{fs.rmSync(work,{recursive:true,force:true});}
