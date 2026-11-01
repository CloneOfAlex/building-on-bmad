import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const work=fs.mkdtempSync(path.join(os.tmpdir(),'bmad-eol-'));
function git(...args){const r=spawnSync('git',args,{cwd:work,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout;}
try{
 git('init','-q');git('config','core.autocrlf','true');
 fs.mkdirSync(path.join(work,'product/export'),{recursive:true});
 fs.writeFileSync(path.join(work,'.gitattributes'),'product/**/PRD.md text eol=lf\n');
 const p=path.join(work,'product/export/PRD.md'),bytes=Buffer.from('RPT-01: Approved reference.\n');
 fs.writeFileSync(p,bytes);git('add','.');fs.unlinkSync(p);git('checkout-index','--','product/export/PRD.md');
 assert.deepEqual(fs.readFileSync(p),bytes);assert.equal(git('show',':product/export/PRD.md'),bytes.toString());
 console.log(JSON.stringify({checkoutControls:1,allPassed:true,scope:'LF attribute with core.autocrlf=true on the local host; not native Windows qualification'}));
}finally{fs.rmSync(work,{recursive:true,force:true});}
