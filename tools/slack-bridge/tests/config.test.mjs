import { createHash } from 'node:crypto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,writeFileSync,chmodSync,linkSync,symlinkSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { privatePath,privateHome,tokens,validateApproval,approvalRevision } from '../src/config.mjs';
test('private paths reject loose modes, symlinks and hardlinks',()=>{
 const d=mkdtempSync(join(tmpdir(),'bridge-config-')); chmodSync(d,0o700);
 try { const p=join(d,'private'); writeFileSync(p,'x',{mode:0o600}); privatePath(p); symlinkSync(p,join(d,'sym')); assert.throws(()=>privatePath(join(d,'sym'))); linkSync(p,join(d,'hard')); assert.throws(()=>privatePath(p)); chmodSync(p,0o644); assert.throws(()=>privatePath(p)); assert.throws(()=>privateHome(d)); } finally { rmSync(d,{recursive:true,force:true}); }
});
test('token file only accepts two specified variables',()=>{
 const d=mkdtempSync(join(tmpdir(),'bridge-token-')); const p=join(d,'tokens');
 try { writeFileSync(p,'SLACK_BOT_TOKEN=xoxb-synthetic\nSLACK_APP_TOKEN=xapp-synthetic\n',{mode:0o600}); assert.equal(Object.keys(tokens(p)).length,2); writeFileSync(p,'SLACK_BOT_TOKEN=xoxb-synthetic\nEVIL=xapp-synthetic\n'); assert.throws(()=>tokens(p)); } finally { rmSync(d,{recursive:true,force:true}); }
});
test('approval must have exact target, bounded window and budget',()=>{
 const now=Date.now(), a={objective:'Repair fixture',brief:'Repair fixture',briefHash:createHash('sha256').update('Repair fixture').digest('hex'),repository:'coderabbit-demo/mmani-shopping-cart',repositoryId:'1437431331',commit:'a'.repeat(40),base:'b'.repeat(40),branch:'codex/fix',owner:'U123',revision:'c'.repeat(64),allowedFiles:['lib/a.ts'],minutes:5,maxTasks:1,startsAt:now-1,endsAt:now+1000};
 a.revision=approvalRevision(a); assert.equal(validateApproval(a,now),a); assert.throws(()=>validateApproval({...a,endsAt:now},now)); assert.throws(()=>validateApproval({...a,minutes:0},now)); assert.throws(()=>validateApproval({...a,allowedFiles:['../escape']},now));
});
test('proposed manifest requests only approved bot scopes and Socket Mode',async()=>{
 const {readFile}=await import('node:fs/promises'); const manifest=JSON.parse(await readFile(new URL('../../../deploy/slack/socket-mode-manifest.json',import.meta.url),'utf8'));
 assert.deepEqual(manifest.oauth_config.scopes.bot,['chat:write','incoming-webhook']); assert.equal(manifest.oauth_config.scopes.user,undefined);
 assert.equal(manifest.settings.socket_mode_enabled,true); assert.equal(manifest.settings.incoming_webhooks.incoming_webhooks_enabled,true); assert.equal(manifest.settings.interactivity.is_enabled,true); assert.equal(manifest.settings.event_subscriptions,undefined);
});
