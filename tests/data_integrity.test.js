const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function storage() {
  const values = new Map();
  return { get length() { return values.size; }, key(i) { return [...values.keys()][i] ?? null; },
    getItem(k) { return values.get(k) ?? null; }, setItem(k,v) { values.set(k,String(v)); }, removeItem(k) { values.delete(k); } };
}
function app(overrides = {}) {
  const listeners = {};
  const window = {QJZH: {}, localStorage: storage(), sessionStorage: storage(),
    addEventListener(t,f) { (listeners[t] ||= []).push(f); }, dispatchEvent(e) { (listeners[e.type] || []).forEach(f=>f(e)); }, ...overrides};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dataImport.js'),'utf8'), {window, CustomEvent: class {constructor(type,opts){this.type=type;this.detail=opts?.detail;}}});
  return {api:window.QJZH.dataImport, window};
}
const row = (extra = {}) => ({timestamp:'2026-01-15T08:00:00+08:00',site_id:'TEST-01',altitude_m:2620,temp_c:-5,rh_percent:62,raw_nh3_ppm:0,device_model:'sensor',...extra});
const header = 'timestamp,site_id,altitude_m,temp_c,rh_percent,raw_nh3_ppm,device_model';
const csv = (device='sensor') => `${header}\n2026-01-15T08:00:00+08:00,TEST-01,2620,-5,62,0,${device}`;
test('CSV rejects broken quotes and mismatched column counts', () => {
  const {api}=app();
  for(const value of ['"unclosed','"closed"tail','sen"sor','sensor,extra']) assert.equal(api.parseCsv(csv(value)).records.length,0,value);
  assert.ok(api.parseCsv(header).errors.length);
});
test('calendar dates and numeric metadata cannot silently normalize invalid values', () => {
  const {api}=app();
  for(const timestamp of ['2026-02-30T08:00:00+08:00','2026-01-15T24:00:00+08:00']) assert.equal(api.validateTimestamp(timestamp),false);
  for(const extra of [{temp_c:'   '},{raw_nh3_ppm:'0x10'},{age_days:-1},{barn_area:'NaN'},{age_days:1.5}]) assert.equal(api.validate(row(extra)).valid,false,JSON.stringify(extra));
  assert.equal(api.validate(row({age_days:0})).valid,true);
});
test('equivalent timestamp offsets and trimmed site IDs identify one observation', () => {
  const {api}=app();
  api.save([row()]); api.save([row({site_id:' TEST-01 ',timestamp:'2026-01-15T00:00:00Z',raw_nh3_ppm:2})]);
  assert.equal(api.getRecords().length,1);
  assert.equal(api.getRecords()[0].raw_nh3_ppm,2);
});
test('all 5000 accepted observations are retained without silent truncation', () => {
  const {api}=app();
  const records=Array.from({length:5000},(_,i)=>row({timestamp:new Date(Date.UTC(2026,0,1,0,0,i)).toISOString()}));
  const saved=api.save(records);
  assert.equal(saved.ok,true); assert.equal(api.getRecords().length,5000);
  const extra=api.save([row({timestamp:'2026-02-01T00:00:00Z'})]);
  assert.equal(extra.ok,false); assert.equal(extra.code,'storageCapacity'); assert.equal(api.getRecords().length,5000);
});
test('sample replacement restores every previous key when a write fails', () => {
  const localStorage=storage(); const {api}=app({localStorage});
  api.save([row({site_id:'USER-01'})]);
  localStorage.setItem('QJZH_REPORTS','{"old":true}');
  const before=api.exportCsv().csv;
  const set=localStorage.setItem;
  localStorage.setItem=(k,v)=>{if(k==='QJZH_RECORDS_QH-HN-005') throw Error('quota');set(k,v);};
  const result=api.loadDemo();
  assert.equal(result.ok,false); assert.equal(api.exportCsv().csv,before);
  assert.equal(localStorage.getItem('QJZH_REPORTS'),'{"old":true}');
});
test('manual entry propagates quota failure instead of marking it saved', () => {
  const localStorage=storage();const {api}=app({localStorage});api.storageStatus();
  localStorage.setItem=()=>{throw Error('quota');};
  const result=api.validateManual(row());
  assert.equal(result.ok,false);assert.equal(result.code,'storageQuota');assert.equal(api.getRecords().length,0);
});
test('blocked storage getters fall back to memory and remain usable', () => {
  const window={QJZH:{},addEventListener(){}};
  for(const key of ['localStorage','sessionStorage']) Object.defineProperty(window,key,{get(){throw Error('SecurityError');}});
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dataImport.js'),'utf8'),{window});
  assert.equal(window.QJZH.dataImport.storage(),'memory');
  assert.equal(window.QJZH.dataImport.save([row()]).ok,true);
  assert.equal(window.QJZH.dataImport.clearData({confirm:true}).ok,true);
});
test('damaged storage is isolated and does not discard healthy sites', () => {
  const localStorage=storage(); const {api}=app({localStorage});api.save([row()]);
  localStorage.setItem('QJZH_RECORDS_BROKEN-01','invalid json');localStorage.setItem('QJZH_SITES','["TEST-01","BROKEN-01"]');
  assert.equal(api.getRecords().length,1);assert.equal(api.storage(),'localStorage');
  localStorage.setItem('QJZH_SITES','{}');assert.deepEqual(Array.from(api.getRecords()),[]);
});
test('CSV exports neutralize formula cells while preserving text on reimport', () => {
  const {api}=app();api.save([row({device_model:'=HYPERLINK("https://example.com")'})]);
  const exported=api.exportCsv().csv;
  assert.ok(exported.includes("'="));
  assert.equal(api.parseCsv(exported).records[0].device_model,'=HYPERLINK("https://example.com")');
});
test('zero ammonia remains visible as zero in the record table', () => {
  const body={innerHTML:''}; const {api}=app({document:{readyState:'loading',addEventListener(){},getElementById(id){return id==='dataRecordRows'?body:null;}}});
  api.save([row()]);api.renderRecordList();assert.ok(body.innerHTML.includes('0 ppm'));assert.ok(!body.innerHTML.includes('- ppm'));
});
test('clear failures remain observable and do not announce full removal', () => {
  const localStorage=storage();const {api}=app({localStorage});api.save([row()]);
  localStorage.removeItem=()=>{throw Error('blocked');};
  const result=api.clearData({confirm:true});
  assert.equal(result.ok,false);assert.equal(result.code,'storageRecovery');assert.equal(api.getRecords().length,1);
});
test('legacy malformed records cannot enter report or replay inputs', () => {
  const localStorage=storage();const {api}=app({localStorage});api.save([row()]);
  localStorage.setItem('QJZH_RECORDS_TEST-01',JSON.stringify([row(),row({timestamp:'2026-01-16T08:00:00+08:00',raw_nh3_ppm:'oops'})]));
  assert.equal(api.getRecords().length,1);assert.equal(api.storageStatus().damagedKeys,1);
});
test('export escapes literal apostrophes before formula text without losing them', () => {
  const {api}=app();api.save([row({device_model:"'=formula"})]);
  assert.equal(api.parseCsv(api.exportCsv().csv).records[0].device_model,"'=formula");
});
test('storage clear events invalidate the cached replay', () => {
  const {api,window}=app();api.save([row()]);assert.equal(api.nextRecord().site_id,'TEST-01');
  while(window.localStorage.length) window.localStorage.removeItem(window.localStorage.key(0));
  window.dispatchEvent({type:'storage',key:null});assert.equal(api.nextRecord(),null);
});
test('institution aggregation uses every field from the latest observation despite input order', () => {
  const records=[row({timestamp:'2026-01-16T08:00:00+08:00',altitude_m:2800,temp_c:10,rh_percent:50,raw_nh3_ppm:20}),row({timestamp:'2026-01-15T08:00:00+08:00',altitude_m:2620,temp_c:-5,rh_percent:62,raw_nh3_ppm:1})];
  const window={QJZH:{storage:{get(){return null;}},dataImport:{getRecords(){return records;}}},compensate(a,t,r,n){return a+t+r+n;},addEventListener(){}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../institutionView.js'),'utf8'),{window});
  const grouped=window.QJZH.institutionView.getRows('imported');
  assert.equal(grouped.length,1);assert.equal(grouped[0].calibrated_nh3_ppm,2880);assert.equal(grouped[0].sample_count,2);assert.equal(grouped[0].temp_c,10);
});
test('replay cache is invalidated by newly saved observations', () => {
  const {api}=app();api.save([row()]);api.nextRecord();
  api.save([row({timestamp:'2026-01-16T08:00:00+08:00'})]);
  assert.equal(api.importedRecords().length,2);assert.equal(api.nextRecord().timestamp,row().timestamp);
});
test('failed optional report-cache writes cannot hide persisted observations', () => {
  const localStorage=storage();const {api,window}=app({localStorage});api.save([row()]);
  const set=localStorage.setItem;localStorage.setItem=(k,v)=>{if(k==='QJZH_REPORTS') throw Error('quota');set(k,v);};
  assert.equal(window.QJZH.storage.set('QJZH_REPORTS',{summary:true}).ok,false);
  assert.equal(api.storage(),'localStorage');assert.equal(api.getRecords().length,1);
});
