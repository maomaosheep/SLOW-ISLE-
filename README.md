# 慢屿咖啡 · 微信点单小程序

单门店、自取、无在线支付。原生微信前端，Django 5.2 LTS + SQLite 后端。

## 本机运行

需要 Python 3.11+。首次在根目录执行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\start.ps1
```

- 门店工作台：<http://127.0.0.1:8000/admin/>
- 新版界面预览：<http://127.0.0.1:8000/prototype/>
- 菜单接口：<http://127.0.0.1:8000/api/catalog/>

后台账号保存在 `backend/.local-admin.txt`，密码随机生成且已被 Git 忽略。初始化不会重置已有账号。也可执行 `.venv\Scripts\python.exe backend/manage.py createsuperuser` 创建管理员。

## 微信开发者工具

1. 导入 `miniprogram` 目录；开发模式使用测试 AppID，真机及发布填自己的 AppID。
2. 启动后台，确认 `miniprogram/config.js` 中 API 地址为 `http://127.0.0.1:8000/api`。
3. 开发者工具本地调试需关闭合法域名校验；前端无需 npm 构建。
4. 修改代码后点击「编译」；如仍显示旧样式，清理编译缓存再编译。
5. 真机调试执行 `scripts/start.ps1 -Lan`，将 API 地址换成电脑局域网 IP；手机与电脑连接同一网络，并允许本机 8000 端口访问。

前端含首页、点单、规格、购物袋、确认下单、订单、取餐码及我的。首页新增「店长推荐」，随机抽取两款不重复的在售咖啡，排除烘焙和茶饮；咖啡不足两款时按实际数量展示。「换两杯」可以重新选择。

## 店员工作台

后台仍使用 Django 的登录、会话、权限和表单校验。店员操作页面改为统一的中文工作台，旧的重复商品/分类/订单管理界面已移除。

- **商品管理**：图片卡片 / 列表切换、搜索、分类与状态筛选、新增、编辑、上下架、删除、上传图片。
- **规格与加价**：打开温度 / 杯型 / 甜度开关，填写选项与加价，点击「添加选项」或删除；全程不需要编写 JSON。关闭全部规格可用于小食。
- **分类管理**：新增、编辑、删除、排序、显示开关；含商品的分类必须先移动商品再删除。
- **订单管理**：左侧订单列表、右侧商品和顾客备注；点击接单、制作完成、确认取餐；可取消或删除记录。
- **门店设置**：门店名、地址、电话、营业时间、接单开关、预计制作时间与公告。

商品修改后，小程序刷新菜单即可同步。历史订单保留原商品、规格、价格和门店快照。后台所有修改有权限检查和 CSRF 校验，删除采用确认弹窗。账号权限沿用 Django 用户权限体系。

营业时间只用于展示，是否接单由「接受点单」开关控制。已完成或已取消订单不能回退。顾客仅能自行取消待接单订单。

## 下单逻辑

服务端校验数量和规格并重新计价，价格有变化时要求顾客重新确认。同一提交标识重复发送返回同一订单；网络结果不确定时，小程序保存原请求重试。取餐码按北京时间每日从 A001 递增。

订单归本机匿名会话所有，不需要微信授权。换设备或清除缓存后不会保留订单入口；跨设备账户系统需后续接入微信登录。

## 检查与预览生成

```powershell
.\.venv\Scripts\python.exe backend/manage.py test coffee
.\.venv\Scripts\python.exe backend/manage.py check
node scripts/check-miniprogram.cjs
node scripts/compile-miniprogram.cjs
node scripts/check-workbench.cjs
node scripts/render-preview.cjs
```

- `compile-miniprogram.cjs` 使用已安装微信开发者工具内的 WXML/WXSS 编译器，安装位置不同时可设置 `WECHAT_COMPILER_DIR`。
- `check-workbench.cjs` 检查真实浏览器中的后台、规格编辑器和响应布局，不修改商品数据。
- `render-preview.cjs` 直接读取实际 WXML/WXSS 和菜单接口生成预览，不维护另一套业务原型；包含独立样式的购物袋组件，检查 320 / 375 / 390 / 430 像素下的满袋、空袋、长名称、多件商品和结算栏布局。预览只用于布局核对，点单请使用小程序。
- 浏览器脚本使用当前环境提供的 Playwright/Chrome 路径，其他电脑需要调整依赖路径。
- `check-integration.cjs` 使用实际小程序页面逻辑调用运行中的后端；生成独立测试订单后，可执行 `.venv\Scripts\python.exe scripts/cleanup-integration.py` 清理该次测试数据。

当前微信窗口自动截图不可用。已通过原生编译、页面逻辑联调和浏览器布局检查；这些不等于微信模拟器或真机的显示验证。

## 发布

准备自己的小程序 AppID、HTTPS 域名与后端部署。运行环境设置 `DJANGO_DEBUG=false`、随机 `DJANGO_SECRET_KEY`、`DJANGO_ALLOWED_HOSTS`；使用 WSGI 服务部署。执行 `collectstatic`，通过 Web 服务器提供 `/static/` 与 `/media/`，并在微信后台配置合法域名。仅可信反向代理场景设置 `TRUST_PROXY=true`。

演示门店资料和图片需替换成真实内容。摄影来自 Unsplash，来源保留在 `scripts/fetch-assets.cjs`。商品图片存于小程序 assets 与后台 static；上传的新图存于被 Git 忽略的 media 目录。不含在线支付、配送、会员、优惠券和多门店。
