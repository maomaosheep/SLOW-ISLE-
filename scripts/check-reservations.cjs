const assert = require('node:assert/strict');
const cart = require('../miniprogram/utils/cart');
const storage = new Map();
const product = {id:1,name:'黄油芝士蛋糕',price:'28.00',options:{},image:'/assets/croissant.jpg',reservation_only:false,reservation_lead_minutes:120};
const store = {is_open:true,pickup_minutes:10};
const slots = [{value:'2026-11-20T16:00:00+08:00',label:'今天 11月20日 16:00'},{value:'2026-11-21T10:00:00+08:00',label:'明天 11月21日 10:00'}];
let options, captured, failure, slotRequests, lastPage;
const notices = [];
const app = {
  globalData:{cart:[]},
  getCatalog:async()=>({store,products:[product]}),
  refreshCart(products){const result=cart.reconcile(this.globalData.cart,products);this.globalData.cart=result.items;return result.changed},
  setCart(items){this.globalData.cart=items}
};
global.getApp=()=>app;
global.Page=definition=>{lastPage={...definition,data:structuredClone(definition.data),setData(data){Object.assign(this.data,data)}}};
global.wx={
  getStorageSync:key=>storage.get(key),setStorageSync:(key,value)=>storage.set(key,structuredClone(value)),removeStorageSync:key=>storage.delete(key),
  showToast:message=>notices.push(message),showModal:message=>notices.push(message),redirectTo(){},switchTab(){},
  request(request){
    if(request.url.includes('/pickup-slots/')){slotRequests++;request.success({statusCode:200,data:structuredClone(options)});return}
    assert.ok(request.url.endsWith('/orders/create/'));
    captured=structuredClone(request.data);
    if(failure==='network'){request.fail();return}
    if(failure===400){request.success({statusCode:400,data:{message:'预约时间已过期，请重新选择。'}});return}
    request.success({statusCode:201,data:{id:'reservation-test'}});
  }
};
function page(){delete require.cache[require.resolve('../miniprogram/pages/checkout/index')];require('../miniprogram/pages/checkout/index');return lastPage}
function reset(required=false,available=true){
  storage.clear();storage.set('slow_isle_token','test-token');notices.length=0;
  product.reservation_only=required;
  app.globalData.cart=[cart.lineFor(product,{},1)];
  options={required,lead_minutes:required?120:10,slots:available?slots:[]};
  failure=null;captured=null;slotRequests=0;
}
(async()=>{
  reset();let checkout=page();await checkout.load();
  assert.equal(checkout.data.pickupMode,'asap');await checkout.submit();
  assert.equal(captured.scheduled_for,null);

  reset();checkout=page();await checkout.load();
  checkout.changePickupMode({currentTarget:{dataset:{mode:'scheduled'}}});
  checkout.selectPickup({detail:{value:'1'}});await checkout.submit();
  assert.equal(captured.scheduled_for,slots[1].value);assert.equal(app.globalData.cart.length,0);

  reset(true);checkout=page();await checkout.load();
  assert.equal(checkout.data.pickupMode,'scheduled');
  checkout.changePickupMode({currentTarget:{dataset:{mode:'asap'}}});
  assert.equal(checkout.data.pickupMode,'scheduled');
  failure='network';await checkout.submit();
  const original=structuredClone(captured);
  assert.equal(checkout.data.pending,true);
  const requestsBefore=slotRequests;
  const restored=page();restored.onLoad();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(slotRequests,requestsBefore,'Pending recovery must not replace the original slot');
  assert.equal(restored.data.pickupLabel,slots[0].label);
  failure=null;await restored.submit();assert.deepEqual(captured,original);

  reset(true,false);checkout=page();await checkout.load();await checkout.submit();
  assert.equal(captured,null);assert.ok(notices.some(item=>item.title.includes('预约时段')));

  reset(true);checkout=page();await checkout.load();failure=400;await checkout.submit();
  assert.equal(checkout.data.pending,false);assert.equal(storage.has('slow_isle_pending_order'),false);
  assert.ok(slotRequests>=2,'Rejected/expired time reloads available slots');
  const requests=[];
  wx.request=request=>requests.push(request);
  require('../miniprogram/pages/orders/index');
  const orders=lastPage;
  const first=orders.load(true);
  await new Promise(resolve=>setImmediate(resolve));
  orders.selectTab({currentTarget:{dataset:{tab:'reserved'}}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.ok(requests[0].url.includes('kind=all'));
  assert.ok(requests[1].url.includes('kind=reserved'));
  requests[1].success({statusCode:200,data:{results:[{id:'reserved',created_at:slots[0].value,scheduled_for:slots[0].value}],has_more:false}});
  await new Promise(resolve=>setImmediate(resolve));
  requests[0].success({statusCode:200,data:{results:[{id:'old-all',created_at:slots[0].value}],has_more:false}});
  await first;
  assert.deepEqual(orders.data.visible.map(order=>order.id),['reserved'],'Slow responses from the old tab must not overwrite reservation results');
  console.log('Passed reservation checkout: optional/required scheduling, selected slot payload, no-slot guard, expired-slot reload and identical recovery after lost response.');
})().catch(error=>{console.error(error);process.exitCode=1});
