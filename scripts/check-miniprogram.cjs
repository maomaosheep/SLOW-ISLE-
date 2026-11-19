const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '../miniprogram');
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(item=>item.isDirectory()?walk(path.join(dir,item.name)):[path.join(dir,item.name)]);}
const files = walk(root);
for(const file of files){
  if(file.endsWith('.json'))JSON.parse(fs.readFileSync(file,'utf8'));
  if(file.endsWith('.js'))execFileSync(process.execPath,['--check',file]);
}
const app=JSON.parse(fs.readFileSync(path.join(root,'app.json'),'utf8'));
for(const page of app.pages)for(const extension of ['js','json','wxml','wxss'])assert.ok(fs.existsSync(path.join(root,page+'.'+extension)),page+'.'+extension);
for(const tab of app.tabBar.list)for(const property of ['iconPath','selectedIconPath'])assert.ok(fs.existsSync(path.join(root,tab[property])));
const native=new Set(['view','text','image','button','input','scroll-view','block','cart-panel']);
for(const file of files.filter(file=>file.endsWith('.wxml'))){
  const source=fs.readFileSync(file,'utf8');
  for(const match of source.matchAll(/<([a-z][\w-]*)\b/g))assert.ok(native.has(match[1]),`Non-native WXML tag ${match[1]} in ${file}`);
  for(const match of source.matchAll(/src="(\/assets\/[^"]+)"/g))assert.ok(fs.existsSync(path.join(root,match[1])));
}
const cart=require('../miniprogram/utils/cart');
const latte={id:1,name:'海盐焦糖拿铁',price:'28.00',options:{temperature:[{label:'热',extra:'0.00'},{label:'冰',extra:'0.00'}],size:[{label:'标准杯',extra:'0.00'},{label:'大杯',extra:'4.00'}]}};
const standard=cart.lineFor(latte,{temperature:'热',size:'标准杯'},1);
const large=cart.lineFor(latte,{temperature:'冰',size:'大杯'},2);
let items=cart.add([standard],large);
assert.deepEqual(cart.totals(items),{count:3,total:'92.00'});
items=cart.add(items,cart.lineFor(latte,{temperature:'热',size:'标准杯'},1));
assert.equal(items.length,2);assert.deepEqual(cart.totals(items),{count:4,total:'120.00'});
items=cart.change(items,standard.key,-1);
assert.deepEqual(cart.totals(items),{count:3,total:'92.00'});
assert.throws(()=>cart.lineFor(latte,{temperature:'温',size:'大杯'},1));
assert.throws(()=>cart.add([standard],{...standard,quantity:20}));
const updated=cart.reconcile(items,[{...latte,price:'30.00'}]);
assert.equal(updated.changed,true);assert.equal(cart.totals(updated.items).total,'98.00');
assert.equal(cart.reconcile(items,[]).items.length,0);
const noOptions=cart.lineFor({...latte,id:2,price:'0.10',options:{}},{},3);
assert.equal(cart.totals([noOptions]).total,'0.30');
assert.match(cart.requestId(),/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
console.log(`Passed: ${app.pages.length} pages, JSON/JavaScript/assets/WXML native tags, cart totals, variants, quantity limits, price reconciliation, idempotency UUID.`);

const {chooseCoffee}=require('../miniprogram/utils/recommendations');
const categories=[{id:1,name:'经典咖啡'},{id:2,name:'风味特调'},{id:3,name:'烘焙小食'},{id:4,name:'茶饮'}];
const choices=[{id:1,category_id:1,name:'美式'},{id:2,category_id:2,name:'拿铁'},{id:3,category_id:1,name:'澳白'},{id:4,category_id:3,name:'可颂'},{id:5,category_id:4,name:'红茶'}];
const picks=chooseCoffee(choices,categories,[],()=>0);
assert.equal(picks.length,2);assert.equal(new Set(picks.map(p=>p.id)).size,2);assert.ok(picks.every(p=>p.id<4));
const reshuffled=chooseCoffee(choices,categories,picks.map(p=>p.id),()=>0);
assert.ok(reshuffled.some(p=>!picks.some(previous=>previous.id===p.id)));
assert.deepEqual(chooseCoffee([],categories),[]);assert.equal(chooseCoffee([choices[0]],categories).length,1);
console.log('Passed manager recommendations: two distinct coffees, excludes bakery/tea, refresh changes choice, graceful empty/one-item state.');

let component;
global.Component=definition=>{component=definition};
require('../miniprogram/components/cart-panel/index');
delete global.Component;
const events=[];
const instance={properties:{count:0},triggerEvent:(...event)=>events.push(event)};
component.methods.checkout.call(instance);
assert.equal(events.length,0,'Empty bag cannot check out');
instance.properties.count=4;
component.methods.checkout.call(instance);
component.methods.change.call(instance,{currentTarget:{dataset:{key:standard.key,delta:'-1'}}});
component.methods.change.call(instance,{currentTarget:{dataset:{key:standard.key,delta:'1'}}});
assert.deepEqual(events,[['checkout'],['change',{key:standard.key,delta:-1}],['change',{key:standard.key,delta:1}]]);
console.log('Passed cart component: checkout guard and both quantity controls preserve item key and numeric delta.');
