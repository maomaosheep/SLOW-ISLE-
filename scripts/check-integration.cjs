const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const storage = new Map(), notices = [];
let app, lastPage, lastNavigation;
global.wx = {
  getStorageSync:key=>storage.get(key),setStorageSync:(key,value)=>storage.set(key,structuredClone(value)),removeStorageSync:key=>storage.delete(key),
  setTabBarBadge(){},removeTabBarBadge(){},showToast:options=>notices.push(options.title),showModal:options=>{notices.push(options.content)},
  switchTab:options=>{lastNavigation=options.url},navigateTo:options=>{lastNavigation=options.url},redirectTo:options=>{lastNavigation=options.url},
  stopPullDownRefresh(){},
  request(options){
    fetch(options.url,{method:options.method,headers:options.header,body:options.method==='POST'?JSON.stringify(options.data || {}):undefined})
      .then(async response=>options.success({statusCode:response.status,data:await response.json()})).catch(error=>options.fail(error));
  }
};
global.App = definition=>{app=definition};global.getApp = ()=>app;
global.Page = definition=>{lastPage={...definition,data:structuredClone(definition.data),setData(patch){Object.assign(this.data,patch)}}};
function page(name){require('../miniprogram/pages/'+name+'/index');return lastPage;}
(async()=>{
  require('../miniprogram/app');app.onLaunch();
  const home=page('home');await home.load(true);assert.ok(home.data.featured);assert.equal(home.data.error,'');
  const menu=page('menu');await menu.load(true);assert.ok(menu.data.visibleProducts.length>=3);
  const detail=page('detail');detail.productId=home.data.featured.id;await detail.load();
  detail.select({currentTarget:{dataset:{group:'size',label:'大杯'}}});assert.equal(detail.data.price,'32.00');
  detail.changeQty({currentTarget:{dataset:{delta:1}}});detail.add();assert.equal(app.globalData.cart[0].quantity,2);
  const checkout=page('checkout');await checkout.load();checkout.nameInput({detail:{value:'联调测试'}});checkout.noteInput({detail:{value:'INTEGRATION_CHECK_ONLY'}});
  assert.equal(checkout.data.total,'64.00');await checkout.submit();assert.match(lastNavigation,/order-detail/);assert.equal(app.globalData.cart.length,0);
  const orderId=new URL('http://localhost'+lastNavigation).searchParams.get('id');
  const cleanupFile=path.resolve(__dirname,'../output/test-artifacts/integration-cleanup.json');
  const cleanup={orderIds:[orderId],token:storage.get('slow_isle_token')};
  await fs.mkdir(path.dirname(cleanupFile),{recursive:true});
  await fs.writeFile(cleanupFile,JSON.stringify(cleanup));
  const order=page('order-detail');order.orderId=orderId;order.active=false;await order.load();assert.equal(order.data.order.total,'64.00');assert.equal(order.data.order.status,'pending');
  const orders=page('orders');await orders.load(true);assert.equal(orders.data.orders.length,1);
  const api=require('../miniprogram/utils/api');await api.cancelOrder(orderId);await order.load();assert.equal(order.data.order.status,'cancelled');
  const slots=await api.pickupSlots([detail.data.product.id]);assert.ok(slots.slots.length);
  const reserved=await api.createOrder({request_id:require('../miniprogram/utils/cart').requestId(),expected_total:'64.00',
    customer_name:'预约联调测试',note:'INTEGRATION_CHECK_ONLY',scheduled_for:slots.slots[0].value,
    items:[{product_id:detail.data.product.id,quantity:2,options:detail.data.selected}]});
  cleanup.orderIds.push(reserved.id);await fs.writeFile(cleanupFile,JSON.stringify(cleanup));
  assert.equal(new Date(reserved.scheduled_for).getTime(),new Date(slots.slots[0].value).getTime());
  assert.ok(reserved.pickup_label);order.orderId=reserved.id;await order.load();
  assert.ok(order.data.statusText.includes('预约'));assert.ok(order.data.statusText.includes(reserved.pickup_label));
  const credential=await fs.readFile(path.resolve(__dirname,'../backend/.local-admin.txt'),'utf8');
  const username=credential.match(/账号：([^\r\n]+)/)[1],password=credential.match(/密码：([^\r\n]+)/)[1];
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try{
    const browserPage=await browser.newPage({viewport:{width:1480,height:960},deviceScaleFactor:1.5});
    const errors=[];browserPage.on('pageerror',error=>errors.push(error.message));
    await browserPage.goto('http://127.0.0.1:8000/admin/');
    await browserPage.locator('#id_username').fill(username);await browserPage.locator('#id_password').fill(password);
    await Promise.all([browserPage.waitForURL('**/admin/'),browserPage.locator('input[type="submit"]').click()]);
    await browserPage.goto('http://127.0.0.1:8000/admin/products/');
    await browserPage.locator('#product-collection').waitFor();
    await browserPage.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(image=>image.decode().catch(()=>{})))});
    const missing=await browserPage.locator('#product-collection img').evaluateAll(images=>images.filter(image=>!image.naturalWidth).length);assert.equal(missing,0);
    await browserPage.screenshot({path:path.resolve(__dirname,'../prototype/backend-live.png'),fullPage:true});
    await browserPage.goto('http://127.0.0.1:8000/admin/orders/?status=all&q=联调测试');
    assert.ok((await browserPage.locator('.orders-layout').textContent()).includes('64.00'));
    await browserPage.goto('http://127.0.0.1:8000/admin/orders/?status=reserved&order='+reserved.id);
    assert.ok((await browserPage.locator('.reservation-banner').textContent()).includes(reserved.pickup_label));
    await browserPage.screenshot({path:path.resolve(__dirname,'../prototype/reservation-workbench.png'),fullPage:true});
    await browserPage.goto('http://127.0.0.1:8000/prototype/');
    assert.equal(await browserPage.locator('.preview-card').count(),3);assert.deepEqual(errors,[]);
  }finally{await browser.close()}
  console.log('Passed live integration: actual mini-program controllers → Django API → immediate/reserved order persistence → reservation detail and staff queue → cancellation → authenticated admin and product images. Native WeChat rendering is a separate check.');
})().catch(error=>{console.error(error);process.exitCode=1});
