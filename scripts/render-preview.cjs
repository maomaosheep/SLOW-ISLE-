// Render the actual WXML and WXSS into a browser layout preview, without maintaining a second UI.
// This checks browser layout only; it is not a WeChat runtime emulator.
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const {chromium} = require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {chooseCoffee} = require('../miniprogram/utils/recommendations');
const cart = require('../miniprogram/utils/cart');
const root = path.resolve(__dirname,'..');
const base = process.env.COFFEE_URL || 'http://127.0.0.1:8000';
const browserCss = styles => styles.replace(/(?<![\w.-])(page|view|text|image)(?=[\s>+~.:#,\[{])/g,tag=>({page:'body',view:'div',text:'span',image:'img'})[tag]).replace(/(-?\d*\.?\d+)rpx/g,(_,n)=>`calc(${Number(n)} * 100vw / 750)`);
async function readStyles(file){
  let styles=await fs.readFile(file,'utf8');
  for(const match of [...styles.matchAll(/@import\s+["']([^"']+)["'];/g)])styles=styles.replace(match[0],await readStyles(path.resolve(path.dirname(file),match[1])));
  return styles;
}
(async()=>{
  const catalog = await fetch(base+'/api/catalog/').then(response=>response.json());
  const pickupOptions = await fetch(base+'/api/pickup-slots/?product_ids='+catalog.products.map(product=>product.id).join(',')).then(response=>response.json());
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const previews=[];
  try{
    const cartSource=await fs.readFile(path.join(root,'miniprogram/components/cart-panel/index.wxml'),'utf8');
    const cartCss=browserCss(await readStyles(path.join(root,'miniprogram/components/cart-panel/index.wxss')));
    const bagItems=catalog.products.slice(0,2).map((product,index)=>cart.lineFor(product,Object.fromEntries(Object.entries(product.options).map(([key,values])=>[key,values[0].label])),index ? 3 : 1));
    for(const variant of ['home','menu','profile','menu-filled','cart','cart-empty','cart-stress','detail','checkout','orders','order-detail','checkout-reservation','checkout-no-slots','detail-reservation','orders-reservation','order-detail-reservation','menu-stock','detail-stock','detail-stock-reservation','checkout-stock','cart-stock']){
      const name=variant.startsWith('cart')||variant.startsWith('menu-') ? 'menu' : variant.replace(/-(stock(?:-reservation)?|reservation|no-slots)$/,'');
      const source=await fs.readFile(path.join(root,'miniprogram/pages',name,'index.wxml'),'utf8');
      const styles=(await readStyles(path.join(root,'miniprogram/app.wxss')))+'\n'+(await readStyles(path.join(root,'miniprogram/pages',name,'index.wxss')));
      const data={loading:false,error:'',store:catalog.store,featured:catalog.products.find(p=>p.is_featured)||catalog.products[0],recommendations:chooseCoffee(catalog.products,catalog.categories),categories:catalog.categories,categoryId:0,categoryName:'人气推荐',keyword:'',visibleProducts:catalog.products,items:[],count:0,total:'0.00',bagVisible:false};
      const sampleOrder={id:1,status:'pending',status_label:'待接单',store_name:catalog.store.name,store_address:catalog.store.address,pickup_code:'A028',pickup_minutes:10,date_label:'2026.11.19 12:53',total:cart.totals(bagItems).total,items:bagItems.map((item,index)=>({...item,id:index+1,product_name:item.name}))};
      Object.assign(data,{product:catalog.products[0],price:catalog.products[0].price,groups:[],quantity:1,isOpen:true,orderable:true,stockBlocked:false,pending:false,customerName:'',note:'',submitting:false,visible:[sampleOrder],orders:[sampleOrder],activeTab:'all',hasMore:false,order:sampleOrder,step:0,created:true,statusText:'咖啡师即将接单。',cancelling:false,pickupMode:'asap',pickupRequired:false,pickupSlots:pickupOptions.slots,pickupIndex:0,pickupLabel:pickupOptions.slots[0]?.label||'',leadMinutes:pickupOptions.lead_minutes});
      if(variant.endsWith('-reservation')||variant==='checkout-no-slots'){
        Object.assign(data,{pickupMode:'scheduled',pickupRequired:true,leadMinutes:120,product:{...catalog.products[0],reservation_only:true,reservation_lead_minutes:120}});
        data.pickupSlots=pickupOptions.slots.filter(slot=>new Date(slot.value).getTime()>=new Date(pickupOptions.server_now).getTime()+120*60*1000);
        data.pickupLabel=data.pickupSlots[0]?.label||'';
        sampleOrder.scheduled_for=data.pickupSlots[0]?.value;
        sampleOrder.pickup_label=data.pickupLabel;
        if(variant==='checkout-no-slots')data.pickupSlots=[];
      }
      if(name==='checkout')Object.assign(data,{items:bagItems,...cart.totals(bagItems)});
      if(['menu-filled','cart','cart-stress'].includes(variant)){
        data.items=variant==='cart-stress' ? Array.from({length:8},(_,i)=>({...bagItems[i%2],key:'stress-'+i,name:'海盐焦糖燕麦咖啡店长限定特调',specification:'冰 / 加大杯 / 标准甜 / 燕麦奶',quantity:20,unit_price:'188.00',unitCents:18800})) : bagItems;
        Object.assign(data,cart.totals(data.items));
      }
      if(variant.includes('-stock')){
        const product={...catalog.products[0],is_out_of_stock:true,reservation_only:variant.endsWith('-reservation')};
        const items=[cart.lineFor(product,Object.fromEntries(Object.entries(product.options).map(([key,values])=>[key,values[0].label])),1)];
        Object.assign(data,{product,items,visibleProducts:catalog.products.map((p,index)=>index?p:product),orderable:cart.canOrder(product),stockBlocked:!cart.canOrder(product),...cart.totals(items)});
      }
      data.bagVisible=variant.startsWith('cart');
      data.productCounts=data.items.reduce((counts,item)=>({...counts,[item.product_id]:(counts[item.product_id]||0)+item.quantity}),{});
      const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
      await page.goto(base+'/prototype/');
      const body=await page.evaluate(({source,data,cartSource,cartCss,base})=>{
        const toHtml=source=>source.replace(/<image\b([^>]*?)\/>/g,'<img$1>').replace(/<cart-panel\b([^>]*?)\/>/g,'<cart-panel$1></cart-panel>').replace(/<view\b/g,'<div').replace(/<\/view>/g,'</div>').replace(/<text\b/g,'<span').replace(/<\/text>/g,'</span>').replace(/<scroll-view\b/g,'<div').replace(/<\/scroll-view>/g,'</div>').replace(/<block\b/g,'<section').replace(/<\/block>/g,'</section>');
        const template=document.createElement('template');
        template.innerHTML=toHtml(source);
        const evaluate=(expression,scope)=>new Function(...Object.keys(scope),'return ('+expression+')')(...Object.values(scope));
        const interpolate=(string,scope)=>string.replace(/{{([\s\S]*?)}}/g,(_,expression)=>{const value=evaluate(expression,scope);return value==null?'':String(value)});
        function children(parent,scope){
          const output=document.createDocumentFragment();let matched=false;
          for(const node of parent.childNodes){
            if(node.nodeType===3){output.append(document.createTextNode(interpolate(node.textContent,scope)));continue}
            if(node.nodeType!==1)continue;
            if(node.hasAttribute('wx:for')){
              const values=evaluate(node.getAttribute('wx:for').slice(2,-2),scope);
              for(let index=0;index<values.length;index++){
                const clone=node.cloneNode(true);clone.removeAttribute('wx:for');
                const temp=document.createElement('div');temp.append(clone);
                output.append(children(temp,{...scope,[node.getAttribute('wx:for-item')||'item']:values[index],index}));
              }
              continue;
            }
            if(node.hasAttribute('wx:if')){matched=!!evaluate(node.getAttribute('wx:if').slice(2,-2),scope);if(!matched)continue}
            else if(node.hasAttribute('wx:elif')){if(matched)continue;matched=!!evaluate(node.getAttribute('wx:elif').slice(2,-2),scope);if(!matched)continue}
            else if(node.hasAttribute('wx:else')){if(matched)continue;matched=true}
            else matched=false;
            if(node.tagName==='CART-PANEL'){
              const host=document.createElement('cart-panel'),shadow=document.createElement('template'),component=document.createElement('template');
              shadow.setAttribute('shadowrootmode','open');
              const style=document.createElement('style');
              style.textContent=':host{display:block}*{box-sizing:border-box}img{object-fit:cover}'+cartCss+'.shade{top:80px;bottom:65px}.cart-list{overflow-y:auto;max-height:calc((100vh - 145px) * .44)}';
              component.innerHTML=toHtml(cartSource);
              shadow.content.append(style,children(component.content,{...scope,visible:scope.bagVisible}));
              host.append(shadow);output.append(host);continue;
            }
            const element=document.createElement(node.tagName.toLowerCase());
            for(const attr of node.attributes){
              if(attr.name.startsWith('wx:')||/^(bind|catch)/.test(attr.name))continue;
              let value=interpolate(attr.value,scope);
              if(attr.name==='disabled'){
                if(value==='false')continue;
                value='';
              }
              if(attr.name==='style')value=value.replace(/(-?\d*\.?\d+)rpx/g,(_,n)=>`calc(${Number(n)} * 100vw / 750)`);
              if(attr.name==='src'&&value.startsWith('/assets/'))value=base+'/miniprogram'+value;
              element.setAttribute(attr.name,value);
            }
            if(element.tagName==='BUTTON')element.setAttribute('size','default');
            element.append(children(node,scope));output.append(element);
          }
          return output;
        }
        const wrapper=document.createElement('div');wrapper.append(children(template.content,data));return wrapper.innerHTML;
      },{source,data,cartSource,cartCss,base});
      const css=browserCss(styles);
      const nav=['home','menu','orders','profile'].map((key,i)=>`<a href="${key==='orders'?'../admin/orders/':key+'.html'}" class="preview-tab ${key===name?'active':''}"><img src="../miniprogram/assets/${['home','cup','order','user'][i]}${key===name?'-active':''}.png">${['首页','点单','订单','我的'][i]}</a>`).join('');
      const showTabs=['home','menu','orders','profile'].includes(name);
      const title={home:'SLOW ISLE · 慢屿',menu:'点一杯，慢慢来',profile:'我的慢屿',detail:'选一杯喜欢的',checkout:'确认订单',orders:'我的订单','order-detail':'订单详情'}[name];
      const html=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · 布局预览</title><style>button[size=default]{width:184px;margin:0 auto;padding:8px 15px}body{margin:0}img{object-fit:cover}*{box-sizing:border-box}${css}\nbody{padding-top:80px;padding-bottom:${showTabs?65:0}px}.preview-header{position:fixed;top:0;left:0;right:0;height:80px;background:#f8f5ef;z-index:20;padding:12px 20px;font-size:11px}.preview-header>div{display:flex;justify-content:space-between;margin-bottom:15px}.preview-header>p{font-size:12px;text-align:center;margin:0}.preview-nav{position:fixed;left:0;bottom:0;right:0;height:65px;display:flex;justify-content:space-around;background:#f8f5ef;border-top:1px solid #e6ded3;z-index:30;padding-bottom:10px}.preview-tab{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;font-size:10px;color:#82776c;text-decoration:none;width:60px}.preview-tab img{width:23px;height:23px}.preview-tab.active{color:#302720}.menu-page{height:calc(100vh - 145px)}.categories,.products{overflow-y:auto}.search input{border:0;background:none;outline:0;padding:0}.bag-bar{bottom:75px}</style></head><body><header class="preview-header"><div><span>9:41</span><span>▮▮▮　▰</span></div><p>${title}</p></header>${body}${showTabs?`<nav class="preview-nav">${nav}</nav>`:''}</body></html>`;
      const previewHtml=html.replace('</style>','picker{display:block}</style>').replace(/[\t ]+$/gm,'');
      await fs.writeFile(path.join(root,'prototype',variant+'.html'),previewHtml);
      await page.setContent(previewHtml.replaceAll('../miniprogram',base+'/miniprogram'),{waitUntil:'networkidle'});
      await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(image=>image.decode()))});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,name+' horizontal overflow');
      if(name==='home'){
        const sizes=await page.locator('.plus').evaluateAll(items=>items.map(item=>{const r=item.getBoundingClientRect();return [r.width,r.height]}));
        assert.ok(sizes.every(([w,h])=>Math.abs(w-h)<1&&w>=24),'plus icons should stay circular');
        assert.equal(await page.locator('.manager-card').count(),Math.min(2,data.recommendations.length));
        assert.ok(await page.locator('.recommend-info').evaluate(el=>el.getBoundingClientRect().width)>150);
      }
      if(name==='menu')assert.ok(await page.locator('.category').evaluateAll(items=>items.every(el=>el.scrollWidth<=el.clientWidth)));
      if(name==='home')await page.addStyleTag({content:'.preview-nav{position:static;margin-top:30px}'});
      await page.screenshot({path:path.join(root,'prototype',variant+'-updated.png'),fullPage:true});
      if(name==='home')await page.addStyleTag({content:'.preview-nav{position:fixed;margin-top:0}'});
      if(name==='home'){await page.locator('.manager-section').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(root,'prototype/recommendations-updated.png')})}
      for(const width of [320,375,390,430]){
        await page.setViewportSize({width,height:width===320 ? 667 : 844});
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,name+' overflow at '+width);
        if(name==='checkout'){
          assert.equal(await page.locator('.pickup-mode.active').count(),1);
          if(variant==='checkout-reservation')assert.ok(await page.locator('.pickup-choice').isVisible());
          if(variant==='checkout-no-slots')assert.ok(await page.locator('.primary').isDisabled());
          assert.equal(await page.locator('.compact-action .arrow').count(),0);
          const action=await page.locator('.compact-action').evaluate(button=>{
            const rect=button.getBoundingClientRect(),label=button.querySelector('.action-label').getBoundingClientRect();
            return {centered:Math.abs((label.left+label.right-rect.left-rect.right)/2)<1&&Math.abs((label.top+label.bottom-rect.top-rect.bottom)/2)<1,compact:rect.height<=90*innerWidth/750};
          });
          assert.ok(action.centered&&action.compact,variant+' compact centered submit action at '+width);
          if(variant==='checkout-stock')assert.ok(await page.locator('.compact-action').isDisabled());
        }
        if(variant==='detail-stock')assert.ok(await page.locator('.primary').isDisabled());
        if(variant==='detail-stock-reservation')assert.equal(await page.locator('.primary').isDisabled(),false);
        if(variant==='menu-stock')assert.equal(await page.locator('.product-quantity .stock-disabled').count(),1);
        if(variant==='cart-stock')assert.equal(await page.locator('.checkout-action').getAttribute('aria-disabled'),'true');
        const prices=await page.locator('.money').evaluateAll(elements=>elements.map(el=>{const s=getComputedStyle(el);return {size:parseFloat(s.fontSize),font:s.fontFamily,variant:s.fontVariantNumeric}}));
        assert.ok(prices.every(p=>Math.abs(p.size-32*width/750)<.1&&p.font.startsWith('Arial')&&p.variant.includes('lining-nums')&&p.variant.includes('tabular-nums')),variant+' unified money typography at '+width);
        const symbols=await page.locator('.quantity-symbol').evaluateAll(elements=>elements.every(el=>{
          const rect=el.getBoundingClientRect(),style=getComputedStyle(el,'::before'),host=getComputedStyle(el),matrix=new DOMMatrix(style.transform);
          const x=parseFloat(host.borderLeftWidth)+parseFloat(style.left)+parseFloat(style.width)/2+matrix.m41,y=parseFloat(host.borderTopWidth)+parseFloat(style.top)+parseFloat(style.height)/2+matrix.m42;
          return style.content!=='none'&&Math.abs(x-rect.width/2)<1&&Math.abs(y-rect.height/2)<1;
        }));
        assert.ok(symbols,variant+' geometric symbol centering at '+width);
        if(name==='home')assert.ok(await page.locator('.plus').evaluateAll(items=>items.every(el=>Math.abs(el.getBoundingClientRect().width-el.getBoundingClientRect().height)<1)));
        if(name==='menu')assert.ok(await page.locator('.category').evaluateAll(items=>items.every(el=>el.scrollWidth<=el.clientWidth)));
        if(name==='menu'){
          const quantities=await page.locator('.product-quantity').evaluateAll(groups=>groups.every(group=>{
            const parts=[...group.children].map(el=>el.getBoundingClientRect()),center=(parts[0].top+parts[0].bottom)/2;
            return parts.every(rect=>Math.abs((rect.top+rect.bottom)/2-center)<1)&&parts.every((rect,index)=>!index||rect.left-parts[index-1].right>=8*innerWidth/750);
          }));
          assert.ok(quantities,variant+' centered and spaced quantity controls at '+width);
          if(variant==='menu-filled')assert.equal(await page.locator('.menu-count').count(),bagItems.length);
          const scrollGutter=await page.locator('.products').evaluate(el=>{
            const edge=el.getBoundingClientRect().right;
            return [...el.querySelectorAll('.plus')].every(button=>edge-button.getBoundingClientRect().right>=30*innerWidth/750);
          });
          assert.ok(scrollGutter,variant+' add buttons must stay clear of the scroll indicator at '+width);
          const bar=await page.locator('.bag-bar').evaluate(el=>{
            const rect=selector=>el.querySelector(selector).getBoundingClientRect();
            const tip=el.querySelector('.bag-tip'),total=rect('.bag-total'),checkout=rect('.bag-checkout');
            return {singleLine:tip.scrollHeight<=parseFloat(getComputedStyle(tip).lineHeight)+1,totalFits:total.right<=checkout.left,tipFits:tip.scrollWidth<=tip.clientWidth};
          });
          assert.ok(bar.singleLine&&bar.totalFits&&bar.tipFits,variant+' checkout bar at '+width);
        }
        if(name==='order-detail'){
          const action=await page.locator('.actions .compact-action').evaluate(button=>{
            const rect=button.getBoundingClientRect(),label=button.querySelector('.action-label').getBoundingClientRect(),parent=button.parentElement.getBoundingClientRect();
            return {compact:rect.width<=360*innerWidth/750+1,centered:Math.abs((label.left+label.right-rect.left-rect.right)/2)<1&&Math.abs((rect.left+rect.right-parent.left-parent.right)/2)<1,noArrow:!button.querySelector('.arrow')};
          });
          assert.ok(action.compact&&action.centered&&action.noArrow,variant+' centered reorder action at '+width+': '+JSON.stringify(action));
        }
        if(data.bagVisible){
          assert.equal(await page.locator('.cart-item').count(),data.items.length);
          const layout=await page.locator('.panel').evaluate(panel=>{
            const fits=el=>el.scrollWidth<=el.clientWidth+1;
            return {title:fits(panel.querySelector('.heading-title')),rows:[...panel.querySelectorAll('.item-body')].every(fits),controls:[...panel.querySelectorAll('.item-bottom')].every(row=>row.querySelector('.item-price').getBoundingClientRect().right<=row.querySelector('.quantity-control').getBoundingClientRect().left),scrolls:panel.querySelector('.cart-list').scrollHeight>panel.querySelector('.cart-list').clientHeight,panelFits:panel.getBoundingClientRect().top>=80};
          });
          assert.ok(layout.title&&layout.rows&&layout.controls&&layout.panelFits,variant+' panel layout at '+width+': '+JSON.stringify(layout));
          if(variant==='cart-stress')assert.ok(layout.scrolls,'long bag must scroll');
          if(width===375)await page.screenshot({path:path.join(root,'prototype',variant+'-updated.png')});
        }
      }
      if(variant==='checkout-reservation'){
        await page.setViewportSize({width:375,height:844});
        await page.locator('.pickup-section').scrollIntoViewIfNeeded();
        await page.screenshot({path:path.join(root,'prototype/reservation-picker.png')});
      }
      if(['home','menu','profile'].includes(variant))previews.push(`<a class="preview-card" href="${name}.html"><span>${title}</span><img src="${name}-updated.png" alt="${title}新版布局"></a>`);
      await page.close();
    }
    const index=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>慢屿咖啡 · 新版界面</title><style>*{box-sizing:border-box}body{margin:0;background:#eee8df;color:#302720;font-family:'Microsoft YaHei',sans-serif;padding:50px 6%}header{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #d9cbb9;padding-bottom:25px}header strong{font-family:Georgia,serif;font-size:28px;font-weight:400}a{color:inherit}header a{font-size:13px;text-decoration:none}h1{font-family:serif;font-size:32px;font-weight:400;margin:35px 0 12px}p{font-size:12px;color:#8d7b67;line-height:1.9}.previews{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:35px;align-items:start;margin-top:30px}.preview-card{text-decoration:none;display:block}.preview-card>span{display:block;font-size:13px;margin-bottom:15px}.preview-card>img{width:100%;border:6px solid #3b332b;border-radius:24px;box-shadow:0 15px 30px #3027200d}footer{border-top:1px solid #d9cbb9;margin-top:40px;padding-top:20px;font-size:11px;color:#8d7b67}footer a{margin-right:20px}@media(max-width:700px){.previews{grid-template-columns:1fr;max-width:390px;margin:30px auto}body{padding:25px}header strong{font-size:23px}}</style></head><body><header><strong>SLOW ISLE / 慢屿咖啡</strong><a href="/admin/">门店工作台 ↗</a></header><h1>留白多一点，好喝不变。</h1><p>修复首页与分类布局，新增店长推荐，简化「我的」。下方由实际小程序 WXML / WXSS 生成布局预览。<br>浏览器布局检查不能代替微信真机显示；实际点单请在微信开发者工具打开 miniprogram。</p><main class="previews">${previews.join('')}</main><footer><a href="/admin/">进入真实管理后台 ↗</a><a href="backend-live.png">商品工作台截图</a><a href="specifications.png">规格可视化表单</a></footer></body></html>`;
    await fs.writeFile(path.join(root,'prototype/index.html'),index);
    const overview=await browser.newPage({viewport:{width:1440,height:1200},deviceScaleFactor:1});
    await overview.goto(base+'/prototype/');await overview.evaluate(async()=>{await Promise.all([...document.images].map(i=>i.decode()))});
    await overview.screenshot({path:path.join(root,'prototype/overview.png'),fullPage:true});await overview.close();
    console.log('Generated previews from real WXML/WXSS; passed home/profile, bag bar, isolated cart component, empty/long bag, quantities and overflow checks at 320/375/390/430px. Browser layout checks do not replace native WeChat validation.');
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
