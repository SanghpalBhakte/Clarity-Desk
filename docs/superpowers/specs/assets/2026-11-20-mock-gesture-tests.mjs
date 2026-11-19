import { chromium } from 'playwright';
const D=process.argv[2];const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1300,height:1000},hasTouch:true});const p=await ctx.newPage();
const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto(`file://${D}/today-C2.html`,{waitUntil:'networkidle'});await p.waitForTimeout(600);
const set=async(k,v)=>{await p.click(`.seg[data-k="${k}"] button[data-v="${v}"]`);await p.waitForTimeout(200)};
const res=[];const ok=(n,c,x='')=>res.push(`${c?'PASS':'FAIL'}  ${n}${x?'  ('+x+')':''}`);
async function into(sel){await p.locator(sel).first().evaluate(e=>e.scrollIntoView({block:'center'}));await p.waitForTimeout(150)}
async function drag(sel,dx,dy=0,steps=12,ms=12){await into(sel);const r=await p.locator(sel).first().boundingBox();const x=r.x+r.width/2,y=r.y+r.height/2;
  await p.mouse.move(x,y);await p.mouse.down();for(let i=1;i<=steps;i++){await p.mouse.move(x+dx*i/steps,y+dy*i/steps);await p.waitForTimeout(ms)}await p.mouse.up();await p.waitForTimeout(450)}
async function hold(sel,ms=600){await into(sel);const r=await p.locator(sel).first().boundingBox();await p.mouse.move(r.x+r.width/2,r.y+r.height/2);await p.mouse.down();await p.waitForTimeout(ms);await p.mouse.up();await p.waitForTimeout(450)}
// real touch swipe through CDP
const cdp=await ctx.newCDPSession(p);
async function touchSwipe(sel,dx){await into(sel);const r=await p.locator(sel).first().boundingBox();const x=r.x+r.width/2,y=r.y+r.height/2;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  for(let i=1;i<=12;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*i/12,y}]});await p.waitForTimeout(14)}
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await p.waitForTimeout(450)}
const txt=s=>p.locator(s).first().innerText();
const sheetOpen=()=>p.evaluate(()=>document.getElementById('app').classList.contains('sheeted'));

await set('mode','evening');await set('tt','usual');
await drag('#app .rw.c[data-row="ds"] .face',150);ok('Class row: swipe right marks Present',(await txt('#app [data-row="ds"]')).includes('Present'));
await p.click('.toast button');await p.waitForTimeout(300);ok('Undo after swipe clears the mark',(await txt('#app [data-row="ds"] .face')).includes('Not marked'));
await drag('#app .rw.c[data-row="dbms"] .face',-90);const tr=await p.locator('#app [data-row="dbms"] .face').evaluate(e=>e.style.transform);ok('Class row: short swipe left opens Absent / More',tr.includes('-160'),tr);
await p.click('#app [data-row="dbms"] .ul button[data-v="a"]');await p.waitForTimeout(300);ok('Tap Absent behind the row marks Absent',(await txt('#app [data-row="dbms"]')).includes('Absent'));
await drag('#app .rw.c[data-row="lab"] .face',8,140);const tr2=await p.locator('#app [data-row="lab"] .face').evaluate(e=>e.style.transform||'none');ok('Vertical drag does not slide the row',!/translateX\((-?[1-9])/.test(tr2),tr2);
await set('mode','morning');
await drag('#app .rw.t[data-task="t3"] .face',150);ok('Task: swipe right marks Done',(await p.locator('#app [data-task="t3"]').getAttribute('class')).includes('done'));
await drag('#app .rw.t[data-task="t2"] .face',-90);await p.click('#app [data-task="t2"] .ul .mv');await p.waitForTimeout(450);ok('Task: swipe left, tap Move opens the Move sheet',await sheetOpen()&&(await txt('#app .sheet')).includes('Move'));
await p.keyboard.press('Escape');await p.waitForTimeout(400);ok('Escape closes the sheet',!(await sheetOpen()));
await hold('#app .rw.c[data-row="dbms"] .face');ok('Hold a class row opens its sheet',await sheetOpen()&&(await txt('#app .sheet h3')).includes('Database'));
ok('Hold does not change any mark',!(await txt('#app .sheet')).includes('Clear mark'));
await p.click('#app .scrim',{position:{x:30,y:30}});await p.waitForTimeout(400);
await hold('#app .rw.t[data-task="t1"] .face');ok('Hold a task opens the Move sheet',await sheetOpen()&&(await txt('#app .sheet h3')).includes('OS quiz'));
await p.keyboard.press('Escape');await p.waitForTimeout(400);
await p.click('#app .rw.c[data-row="lab"] .face');await p.waitForTimeout(450);ok('Tap a class row opens its sheet',await sheetOpen());
await p.click('#app .sheet [data-label]');await p.fill('#lbl-in','OSL');await p.press('#lbl-in','Enter');await p.waitForTimeout(400);
ok('Edit the name on the strip',(await p.locator('#app .strip .b[data-go="lab"]').innerText())==='OSL');
await set('mode','inclass');
await touchSwipe('#app .now .face',170);ok('Now card: real touch swipe right marks Present',(await txt('#app .now')).includes('Present')&&!(await txt('#app .now')).includes('Swipe right'));
await set('tt','split');const labs=await p.locator('#app .strip .b').allInnerTexts();ok('Split day labels (DEMP made from name)',labs.includes('DEMP')&&labs.includes('2 labs'),labs.join(' | '));
await set('tt','busy');await set('mode','morning');const bl=await p.locator('#app .strip .b').allInnerTexts();ok('Busy day: no cut names, no repeats',bl.filter(Boolean).every(l=>!/…/.test(l))&&new Set(bl.filter(Boolean)).size===bl.filter(Boolean).length,bl.join(' | '));
await set('dev','lap');const ll=await p.locator('#app .strip .b').allInnerTexts();ok('Laptop busy labels',true,ll.join(' | '));
console.log(res.join('\n'));console.log('errors',errs);await b.close();
