const assert = require('node:assert/strict');
const cart = require('../miniprogram/utils/cart');
const product = {id:1,name:'芝士蛋糕',price:'28.00',options:{},is_out_of_stock:false,reservation_only:false};
const store = {is_open:true,pickup_minutes:10};
let page, requests = 0, submissions = 0;
const notices = [];
const app = {
  globalData:{cart:[]},
  getCatalog:async()=>({store,products:[product],categories:[]}),
  refreshCart(products){const result=cart.reconcile(this.globalData.cart,products);this.globalData.cart=result.items;return result.changed;},
  setCart(items){this.globalData.cart=items;},
  addToCart(product,options,quantity){this.setCart(cart.add(this.globalData.cart,cart.lineFor(product,options,quantity)));}
};
global.getApp=()=>app;
global.Page=definition=>{page={...definition,data:structuredClone(definition.data),setData(data){Object.assign(this.data,data);}};};
global.wx={showToast:message=>notices.push(message),getStorageSync:()=> 'test-token',request(request){
  requests++;
  if(request.url.includes('/pickup-slots/'))request.success({statusCode:200,data:{required:true,lead_minutes:60,slots:[{value:'2026-11-20T12:00:00+08:00',label:'今天 12:00'}]}});
  else {submissions++;throw new Error('Unexpected submission');}
}};
function loadPage(name){delete require.cache[require.resolve('../miniprogram/pages/'+name+'/index')];require('../miniprogram/pages/'+name+'/index');return page;}
(async()=>{
  const old = cart.lineFor(product,{},2);
  product.is_out_of_stock=true;
  const result=cart.reconcile([old],[product]);
  assert.equal(result.changed,true);
  assert.equal(result.items.length,1,'Keep unavailable items visible so the customer can explicitly remove them');
  assert.equal(cart.canOrder(result.items[0]),false);
  assert.throws(()=>cart.add([],result.items[0]),/缺货/);
  assert.throws(()=>cart.change(result.items,result.items[0].key,1),/缺货/);
  assert.equal(cart.change(result.items,result.items[0].key,-1)[0].quantity,1);
  app.globalData.cart=[old];
  const checkout=loadPage('checkout');await checkout.load();
  assert.equal(checkout.data.stockBlocked,true);
  assert.equal(requests,0,'Do not request reservation slots for fully blocked stock');
  await checkout.submit();assert.equal(submissions,0);
  const detail=loadPage('detail');detail.productId=1;await detail.load();
  assert.equal(detail.data.orderable,false);detail.add();
  assert.equal(app.globalData.cart[0].quantity,2);
  const menu=loadPage('menu');menu.setData({products:[product],store});menu.syncCart();
  menu.adjustProduct({currentTarget:{dataset:{id:1,delta:1}}});
  assert.equal(menu.data.productCounts[1],2);
  product.reservation_only=true;
  assert.equal(cart.canOrder(product),true);
  app.globalData.cart=cart.reconcile(app.globalData.cart,[product]).items;
  const reserved=loadPage('checkout');await reserved.load();
  assert.equal(reserved.data.stockBlocked,false);assert.equal(reserved.data.pickupMode,'scheduled');
  assert.equal(requests,1);
  let component;
  global.Component=definition=>{component=definition;};
  require('../miniprogram/components/cart-panel/index');
  const events=[];
  const bag={properties:{count:1,items:[{...old,is_out_of_stock:true,reservation_only:false}]},triggerEvent:event=>events.push(event),setData(data){Object.assign(this,data);}};
  component.observers.items.call(bag,bag.properties.items);
  assert.equal(bag.stockBlocked,true);component.methods.checkout.call(bag);assert.deepEqual(events,[]);
  const {chooseCoffee}=require('../miniprogram/utils/recommendations');
  assert.deepEqual(chooseCoffee([{...product,name:'拿铁',reservation_only:false}],[]),[]);
  console.log('Passed stock UI guards: cached cart reconciliation, blocked adds/increments, removable stock, disabled checkout, no slot request, detail/menu/bag guards, reservation override and recommendation filtering.');
})().catch(error=>{console.error(error);process.exitCode=1;});
