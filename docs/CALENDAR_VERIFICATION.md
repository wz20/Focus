# Focus 0.1.4 · 工作月历与数据兼容验证

## 安装包
- 文件：Focus-0.1.4-arm64.dmg
- 大小：204888097 字节（约205MB）
- SHA-256：ea634cbed48c10203b4823ade23e1c0cdec56353dd9d720c380cb33c897c3d44
- ARM64 Apple Silicon，包内最低系统版本 macOS 13.0。
- 完整 Focus.app，沿用原有 Electron 运行库，不需要用户编译。
- ad-hoc 测试签名，未做 Developer ID 签名和 Apple 公证。

## 本次功能
- 时间轴内「甘特图 / 月历」切换，保留原有甘特图日/周/月尺度。
- 月历按周一到周日，支持上一月、下一月、月份选择及回到本月。
- 显示计划范围、跨日延续以及独立 deadline；截止时间不会因视图切换、翻月或筛选而变化。
- 同一天计划和 deadline 属于同一任务时合并成一项；截止与计划在不同日期时分开显示，但始终只有一个任务 ID。
- 点日期查看当日列表，点 + 打开预填该日计划时间的新增表单。取消或关闭未保存表单不创建任务。
- 日格子容量随空间变化，任务多时查看全部，日列表虚拟滚动；64条同日任务与1800条投影测试没有遗漏或重复。
- 无计划且无deadline的任务保留在「未安排日期」，不会擅自放到今天。
- 原有状态 todo / ing / done → 再点归档、恢复、提醒、选填deadline、四象限选择器均保留。
- 2026年中国大陆节假日和补班离线标注；其他年份只标注周末，不推测未来调休。任务展示采用设备本地日期。
- 参考图用作布局参考，未自动把截图中的工作写入用户任务。展示截图使用测试示例。

## 数据兼容性
- CFBundleIdentifier 保持 com.focuslocal.desktop；productName 和 app.setName 保持 Focus。
- 数据仍在 ~/Library/Application Support/Focus/；tasks.json、tasks.backup.json、reminders.json 沿用。
- schema version仍为1；不增加任务字段，不需要数据迁移、不初始化新数据库。
- model.mjs、store.mjs、repository.mjs、preload.cjs、任务编辑器modal.mjs与0.1.3逐字节一致。
- main.cjs只有About弹窗的两个版本字符串从0.1.3变为0.1.4，其余代码与上一版逐字节一致。
- 1000条旧格式任务包含备注、状态、ID、计划时间、deadline、提醒提前量、完成和归档时间：读取后浏览24个月再重开，逻辑数据完全一致，tasks.json和tasks.backup.json的文件哈希未变。
- 升级后首次明确新增一项再保存，原1000条每一个字段仍相同，旧文件完整保留为tasks.backup.json。
- 有效、近期reminders.json在载入后不重置去重记录，测试中没有重复发送。
- 浏览器测试验证切换视图/翻月/搜索/筛选的任务保存调用次数为0。
- 安装包内未包含tasks.json或reminders.json，不打包真实工作数据。

## 实际执行
- Node：93项通过，0失败（原75项 + 月历投影14项 + 数据兼容4项）。
- 浏览器：86项通过，0renderer JavaScript异常（原70项 + 月历16项）。
- 视口：1440×1100、1440×1000、1280×800、900×700、390×844。日列表和格子在窄屏以日期/数量+展开列表呈现。
- 局部源码语法检查、Mac脚本Bash语法检查通过。
- 新月历的纯逻辑API和月历切换控件先在未实现版本上检查失败，再实现并通过。
- 完整DMG由7-Zip独立解析：UDIF v4 / Apple分区图 / HFSX；全镜像分块CRC通过。
- HFSX目录和分配位图检查：所有fork分配块合法、无重叠、无遗失引用，/Applications安装链接直接读取仍为/Applications。
- 从最终DMG解出的285个App普通文件与签名后的包逐一SHA-256相同；14个App内部相对链接相同。
- 包内16个源码文件与最终测试src一致；Info.plist和包内package.json版本0.1.4。
- 主程序9个代码页、5个非零特殊槽哈希匹配；22个资源封印、8个嵌套代码封印匹配；259个嵌套运行库普通文件相对0.1.3逐字节不变。

## 验证边界
- 当前环境Linux；没有在macOS上实际挂载、启动或调用Apple hdiutil/codesign/spctl。
- Browser/IAB未提供；使用Playwright Chromium。直接localhost导航被环境策略阻止（ERR_BLOCKED_BY_ADMINISTRATOR），没有改变该策略；UI测试用set_content和生产同源代码生成的renderer bundle，Electron桥用受限替身。
- 磁盘文件读写由真实Node临时目录测试，不把模拟IPC和浏览器检查描述为Mac原生测试。
- 提醒原生权限/实际送达未实机验证；维持0.1.3前台页内、后台系统通知策略，不暗示已改成所有情况系统通知。
- 以上数据兼容检查证明代码层面的正常升级路径，不覆盖用户自行删除数据目录、磁盘故障或第三方清理软件。

## 更新方法
旧版先导出一份独立JSON备份以便保险，正常退出Focus，再把新版Focus.app拖入Applications覆盖旧应用。不要删除 ~/Library/Application Support/Focus/ 。无需重新录入或导入旧备份。

## 日历公开来源
国务院办公厅2026年安排的政府转载：https://www.wuhan.gov.cn/zwgk/tzgg/202609/t20260907_2844002.shtml
HFSX格式校验依据：Apple TN1150 https://developer.apple.com/library/archive/technotes/tn/tn1150.html
