import fs from 'node:fs';
/* 直接加载同目录上一级的真实 client.js，测的就是上线那份代码。 */
const CODE = fs.readFileSync(new URL('../client.js', import.meta.url), 'utf8');
class El{
  constructor(t){this.tagName=String(t).toUpperCase();this.children=[];this.attrs={};this._text='';this.style={};this.parentElement=null;}
  get className(){return this.attrs.class||'';} set className(v){this.attrs.class=String(v);}
  get textContent(){return this.children.length?this.children.map(c=>c.textContent).join(''):this._text;}
  set textContent(v){this.children=[];this._text=String(v);}
  setAttribute(k,v){this.attrs[k]=String(v);}
  getAttribute(k){return Object.prototype.hasOwnProperty.call(this.attrs,k)?this.attrs[k]:null;}
  removeAttribute(k){delete this.attrs[k];}
  appendChild(c){c.parentElement=this;this.children.push(c);return c;}
  insertBefore(c,ref){ if(c.parentElement)c.parentElement.children=c.parentElement.children.filter(x=>x!==c);
    const i=ref?this.children.indexOf(ref):-1; if(i<0)this.children.push(c); else this.children.splice(i,0,c);
    c.parentElement=this; return c; }
  addEventListener(t,f){ (this._h=this._h||{})[t]=(this._h[t]||[]).concat(f); }
  get nextSibling(){const p=this.parentElement;if(!p)return null;const i=p.children.indexOf(this);return i<0||i+1>=p.children.length?null:p.children[i+1];}
  get previousSibling(){const p=this.parentElement;if(!p)return null;const i=p.children.indexOf(this);return i<=0?null:p.children[i-1];}
  querySelectorAll(s){return all(this,s);} querySelector(s){return all(this,s)[0]||null;}
}
const matches=(e,s)=>{ if(s.startsWith('[class*="')) return e.className.includes(s.slice(9,-2));
  if(s==='[data-composer-placeholder]') return e.getAttribute('data-composer-placeholder')!==null;
  if(s==='[data-placeholder]') return e.getAttribute('data-placeholder')!==null;
  if(s.startsWith('.')) return (' '+e.className+' ').indexOf(' '+s.slice(1)+' ')!==-1;
  if(/^\[[a-z-]+\]$/.test(s)) return e.getAttribute(s.slice(1,-1))!==null;
  /* [data-x="v"]：插件后来用它认「当前是哪个预设」的样式芯片，桩里按值比较即可。 */
  const attrValue = /^\[([a-z-]+)="([^"]*)"\]$/.exec(s);
  if(attrValue) return e.getAttribute(attrValue[1])===attrValue[2];
  throw new Error(s); };
const walk=(r,f)=>{for(const c of r.children){f(c);walk(c,f);}};
const all=(r,s)=>{const o=[];walk(r,e=>{if(matches(e,s))o.push(e);});return o;};
const collect=(n,o=[])=>{ if(!n||typeof n!=='object')return o; if(Array.isArray(n)){n.forEach(x=>collect(x,o));return o;}
  if(n.p)o.push(n); (n.c||[]).forEach(x=>collect(x,o)); return o; };
const ZH_HERO='描述你想要构建的内容, / 调用指令, @ 文件或对话';

function run(seed){
  const html=new El('html'),head=new El('head'),body=new El('body');
  html.appendChild(head);html.appendChild(body);
  const grow=new El('div'),ed=new El('div'),ph=new El('div');
  ed.setAttribute('data-placeholder',ZH_HERO);
  ph.setAttribute('data-composer-placeholder','');ph.textContent=ZH_HERO;
  grow.appendChild(ed);grow.appendChild(ph);body.appendChild(grow);
  /* Hero 标题区：<div class="<hash>_titleGroup"><span>原标题</span><span class=X_previewBadge>预览版</span></div> */
  const group=new El('div'); group.className='AbC123_titleGroup';
  const title=new El('span'); title.textContent='探索未至之境';
  const badge=new El('span'); badge.className='AbC123_previewBadge'; badge.textContent='预览版';
  group.appendChild(title); group.appendChild(badge); body.appendChild(group);
  const store=new Map();
  if(seed!==undefined) store.set('dsh-brand-rename:view',JSON.stringify(seed));
  const window={__ModuleLoader__:{load:d=>{window.__def=d;}},
    localStorage:{getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)}};
  let obs=null; const regs={}; let dict=null;
  const document={documentElement:html,head,body,getElementById:()=>null,
    createElement:t=>new El(t),querySelectorAll:s=>all(html,s),querySelector:s=>all(html,s)[0]||null,
    /* factory 会注册全局 click（点空白处收起样式菜单），桩里记下即可。 */
    addEventListener:()=>{},removeEventListener:()=>{}};
  const MutationObserver=class{constructor(cb){obs=cb;}observe(){}};
  const react={createElement:(t,p,...c)=>({t,p,c}),useState:i=>[typeof i==='function'?i():i,()=>{}],useEffect:()=>{}};
  const req=id=>{ if(id==='react')return react;
    if(id==='@deepseek-ai/dsh-client-ui-primitives')return{BrandWordmark:function(){}}; throw new Error(id); };
  new Function('window','document','MutationObserver','requestAnimationFrame','console',CODE)
    (window,document,MutationObserver,f=>f(),console);
  /* 可切换的假模式服务：让 currentModeId() 能被测试驱动（用于按模式的文案）。
     预设 id 与 region C4 的 MODE_DEFS 一致。 */
  let currentPreset='standard';
  let sessionsSub=null;
  const sessionsService={
    list:{
      getSnapshot:()=>({current:'s1',byId:{s1:{id:'s1',blank:true,projectionValues:{agentPreset:currentPreset}}}}),
      subscribe:fn=>{sessionsSub=fn;return()=>{sessionsSub=null;};}
    }
  };
  const remoteService={agentPresets:{select:async()=>{}}};
  window.__def.factory(req).apply({
    effect:f=>f(),
    slots:{inject:(n,cb)=>cb(),register:(o,c)=>{regs[o.id||o.name]=c;return()=>{};}},
    locale:{register:(ns,d)=>{dict=d;return()=>{};}},
    get: name => (name==='sessions'?sessionsService:name==='remote'?remoteService:undefined),
    inject: (deps, cb) => {
      const scope={sessions:sessionsService,remote:remoteService};
      const d = typeof cb === 'function' ? cb(scope) : undefined;
      return () => { if (typeof d === 'function') d(); };
    }
  });
  const t=k=>(dict&&dict.zh&&dict.zh[k]!==undefined)?dict.zh[k]:k;
  const Row=regs['brand-placeholder'];
  const tree=Row({t});
  /* 中文那批与英文那批分开：英文输入框的 aria-label 带「输入框提示英文」前缀。 */
  const allInputs=collect(tree).filter(n=>n.t==='input');
  const enPrefix=t('placeholderEn.aria');
  const inputs=allInputs.filter(n=>String(n.p['aria-label']||'').indexOf(enPrefix)!==0);
  const enInputs=allInputs.filter(n=>String(n.p['aria-label']||'').indexOf(enPrefix)===0);
  const inputFor=k=>inputs.find(n=>n.p['aria-label']===t('label.'+k));
  const enInputFor=k=>enInputs.find(n=>n.p['aria-label']===enPrefix+' '+t('label.'+k));
  const HRow=regs['brand-headline'];
  const hTree=HRow({t});
  const hInput=collect(hTree).find(n=>n.t==='input');
  const buttonText=n=>(n.c||[]).filter(x=>typeof x==='string').join('');
  return {ph,ed,html,title,badge,fire:()=>obs&&obs(),
    /* 切到某个预设并触发一次会话订阅回调 —— 插件据此刷新滑块与灰字。 */
    switchPreset:v=>{ currentPreset=v; if(typeof sessionsSub==='function') sessionsSub(); },
    currentPreset:()=>currentPreset,
    type:(k,v)=>inputFor(k).p.onChange({target:{value:v}}),
    typeEn:(k,v)=>enInputFor(k).p.onChange({target:{value:v}}),
    enInputs,
    typeHeadline:v=>hInput.p.onChange({target:{value:v}}),
    headlineValue:()=>hInput.p.value,
    headlinePlaceholder:()=>hInput.p.placeholder,
    /* 标题行里现在有多个按钮（选取方式 / 添加 / 删除 / 恢复默认），按文案找。 */
    resetHeadline:()=>collect(hTree).find(n=>n.t==='button'&&buttonText(n)===t('common.reset')).p.onClick(),
    tree,inputs,t};
}
let pass=0,fail=0;
const chk=(n,g,w)=>{if(g===w){pass++;console.log('  ✓',n);}else{fail++;console.log('  ✗',n,'\n      得到:',JSON.stringify(g),'\n      期望:',JSON.stringify(w));}};

console.log('【1】输入 → 立即生效，其余状态不受影响');
{ const r=run({placeholders:{hero:'你好呀，想我了吗？'}}); r.fire();
  chk('hero 替换',r.ph.textContent,'你好呀，想我了吗？');
  chk('属性同步',r.ed.getAttribute('data-placeholder'),'你好呀，想我了吗？');
  chk('普通会话未被碰',r.ph.textContent!=='发消息或创建任务, / 调用指令, @ 文件或对话',true); }
{ const r=run({placeholders:{plan:'说说你想做什么'}}); r.fire();
  chk('plan 替换',r.ph.textContent,ZH_HERO); }   // 节点是 hero，故不受 plan 影响

console.log('【2】全部留空 = 完全不动');
{ const r=run({placeholders:{}}); r.fire(); r.fire();
  chk('保持原文',r.ph.textContent,ZH_HERO); }

console.log('【3】不认识的动态文案绝不被改');
{ const r=run({placeholders:{hero:'X'}});
  r.ph.textContent='当前会话被业务占用，暂不可发送'; r.fire();
  chk('动态原因保持',r.ph.textContent,'当前会话被业务占用，暂不可发送');
  chk('过期标记已清',r.ph.getAttribute('data-dsha-ph-orig'),null); }

console.log('【4】设置行输入 → 生效；清空 → 原样还原');
{ const r=run({placeholders:{}}); r.fire();
  r.type('hero','想我了吗？'); r.fire();
  chk('输入后生效',r.ph.textContent,'想我了吗？');
  chk('记下原文',r.ph.getAttribute('data-dsha-ph-orig'),ZH_HERO);
  r.type('hero',''); r.fire();
  chk('还原为官方原文',r.ph.textContent,ZH_HERO);
  chk('属性也还原',r.ed.getAttribute('data-placeholder'),ZH_HERO);
  chk('标记清干净',r.ph.getAttribute('data-dsha-ph-orig'),null); }

console.log('【5】官方原文变了（认不出来）→ 不得拿旧原文覆盖新文案');
{ const r=run({placeholders:{hero:'我的文案'}}); r.fire();
  chk('先替换成功',r.ph.textContent,'我的文案');
  const stale=r.ph.getAttribute('data-dsha-ph-orig');
  r.ph.textContent='DSH 换代后的全新提示';      // 模拟前端升级，React 写入新原文
  r.fire();
  chk('新文案未被旧原文盖掉',r.ph.textContent,'DSH 换代后的全新提示');
  chk('旧原文确实不同于新文案',stale!=='DSH 换代后的全新提示',true);
  r.ph.textContent=ZH_HERO; r.fire();           // 若又回到已知原文，应重新接管
  chk('回到已知原文后重新接管',r.ph.textContent,'我的文案'); }

console.log('【6】React 重建节点后仍然生效；重复触发幂等');
{ const r=run({placeholders:{hero:'只写一次'}}); r.fire();
  r.ph.removeAttribute('data-dsha-ph-orig'); r.ph.removeAttribute('data-dsha-ph-applied');
  r.ph.removeAttribute('data-dsha-ph-key'); r.ph.textContent=ZH_HERO; r.fire(); r.fire(); r.fire();
  chk('重建后仍等于自定义文案',r.ph.textContent,'只写一次'); }

console.log('【7】旧版 {placeholder} 字段迁移到 hero');
{ const r=run({placeholder:'迁移过来的文案'}); r.fire();
  chk('迁移生效',r.ph.textContent,'迁移过来的文案'); }

console.log('【8】设置行结构：通用 7 项 + hero/default 各 3 个模式 = 13 个中文输入框，标签与灰字提示都来自 locale');
{ const r=run({placeholders:{}}); const t=r.t;
  chk('输入框数量',r.inputs.length,13);
  chk('hero 灰字提示 = 官方原文',r.inputs.find(n=>n.p['aria-label']===t('label.hero')).p.placeholder,ZH_HERO);
  chk('plan 灰字提示 = 官方原文',r.inputs.find(n=>n.p['aria-label']===t('label.plan')).p.placeholder,'描述你的任务以生成计划');
  const KEYS=['hero','default','plan','steerQueue','workspace','unavailable','parentOffline'];
  const MODE_KEYS=['hero','default'], MODE_NAMES=['工作模式','纯文本对话模式','昔涟工作模式'];
  const want=[];
  for (const k of KEYS) want.push(t('label.'+k));
  for (const k of MODE_KEYS) for (const n of MODE_NAMES) want.push(t('label.'+k)+' · '+n);
  chk('13 个标签齐全',r.inputs.map(n=>n.p['aria-label']).sort().join(','),want.sort().join(',')); }

console.log('【9】归一化后 7×2 条默认值无碰撞');
{ const norm=s=>String(s).replace(/[\s,，]/g,'');
  const ZH=['描述你想要构建的内容, / 调用指令, @ 文件或对话','发消息或创建任务, / 调用指令, @ 文件或对话','描述你的任务以生成计划','Cmd/Ctrl+Enter 插话发送全部排队消息','选择一个工作区开始','会话不可用','父会话已离线，无法继续发送；仍可停止当前运行'];
  const EN=['Describe what you want to build, / commands, @ files or sessions','Message or run a task, / commands, @ files or sessions','describe your task to generate plan','Cmd/Ctrl+Enter steers all queued messages','Choose a workspace to start','Session unavailable','Parent session offline; sending is unavailable but you can still stop the run'];
  const set=new Set([...ZH,...EN].map(norm));
  chk('14 条互不相同',set.size,14); }

console.log('【10】Hero 标题：默认替换为插件默认值，预览版徽标被隐藏');
{ const r=run({placeholders:{}}); r.fire();
  chk('标题替换',r.title.textContent,'嗨，想我了吗？');
  chk('输入框显示当前生效值',r.headlineValue(),'嗨，想我了吗？');
  chk('徽标被隐藏',r.badge.style.display,'none'); }

console.log('【11】设置里改标题 → 立即生效');
{ const r=run({placeholders:{}}); r.fire();
  r.typeHeadline('今天也要加油鸭'); r.fire();
  chk('标题跟着变',r.title.textContent,'今天也要加油鸭'); }

console.log('【12】清空标题 → 还原系统原文（探索未至之境）');
{ const r=run({placeholders:{}}); r.fire();
  r.typeHeadline('临时标题'); r.fire();
  chk('先替换成功',r.title.textContent,'临时标题');
  chk('记下系统原文',r.title.getAttribute('data-dsha-headline-orig'),'探索未至之境');
  r.typeHeadline(''); r.fire();
  chk('还原为系统原文',r.title.textContent,'探索未至之境');
  chk('标记清干净',r.title.getAttribute('data-dsha-headline-applied'),null); }

console.log('【13】点「恢复默认」→ 回到插件默认值；徽标始终保持隐藏');
{ const r=run({placeholders:{}}); r.fire();
  r.typeHeadline('随便写点'); r.fire();
  r.resetHeadline(); r.fire();
  chk('回到插件默认值',r.title.textContent,'嗨，想我了吗？');
  chk('徽标仍然隐藏',r.badge.style.display,'none'); }

console.log('【15】英文提示：拼在中文后面同一行');
{ const r=run({placeholders:{}}); r.fire();
  r.type('hero','想要聊点什么吗？');
  r.fire();
  chk('先只有中文',r.ph.textContent,'想要聊点什么吗？');
  r.typeEn('hero','Want to chat?');
  r.fire();
  chk('英文另起一行',r.ph.textContent,'想要聊点什么吗？\nWant to chat?');
  chk('属性也跟着同步',r.ed.getAttribute('data-placeholder'),'想要聊点什么吗？\nWant to chat?');
  chk('节点上允许换行（盖掉官方 nowrap）',r.ph.style.whiteSpace,'pre-line');
  r.type('hero','');
  r.fire();
  chk('中文清空后只留英文',r.ph.textContent,'Want to chat?');
  r.typeEn('hero','');
  r.fire();
  chk('两边都空 → 还原官方原文',r.ph.textContent,ZH_HERO);
  chk('还原时行内样式也摘掉',r.ph.style.whiteSpace,'');
  chk('标记清干净',r.ph.getAttribute('data-dsha-ph-orig'),null); }
{ const r=run({placeholders:{}}); r.fire();
  r.typeEn('hero','Only english');
  r.fire();
  chk('只填英文也能用',r.ph.textContent,'Only english');
  chk('记录的是官方原文',r.ph.getAttribute('data-dsha-ph-orig'),ZH_HERO); }
{ const r=run({placeholderEns:{plan:'make a plan'}}); r.fire();
  chk('plan 状态本身不是当前节点 → 不受影响',r.ph.textContent,ZH_HERO); }
{ const r=run({}); 
  chk('英文输入框数量',r.enInputs.length,13); }

console.log('【16】旧配置（无 headline 字段）升级后行为不变');
{ const r=run({placeholders:{hero:'X'}}); r.fire();
  chk('标题仍是插件默认值',r.title.textContent,'嗨，想我了吗？'); }

console.log('【17】按模式的灰字提示（只有 hero / default 看模式）');
{ const r=run({placeholders:{hero:'通用文案'},
    placeholderByMode:{standard:{hero:'工作模式文案'},chat:{hero:'昔涟文案'}}});
  r.fire();
  chk('预设 standard → 用 standard 专属',r.ph.textContent,'工作模式文案');
  r.switchPreset('chat');
  chk('切到 chat → 换成 chat 专属',r.ph.textContent,'昔涟文案');
  r.switchPreset('standard');
  chk('切回 standard → 回到 standard 专属',r.ph.textContent,'工作模式文案'); }
{ const r=run({placeholders:{hero:'通用文案'},
    placeholderByMode:{standard:{hero:''},chat:{hero:'昔涟文案'}}});
  r.fire();
  chk('专属留空 → 回落通用文案',r.ph.textContent,'通用文案');
  r.switchPreset('chat');
  chk('另一模式有专属 → 优先专属',r.ph.textContent,'昔涟文案'); }
{ const r=run({placeholderByMode:{chat:{hero:'中文行'}},placeholderEnByMode:{chat:{hero:'EN 行'}}});
  r.fire(); r.switchPreset('chat');
  chk('模式专属同样中英分两行',r.ph.textContent,'中文行\nEN 行'); }

console.log(`\n结果：通过 ${pass}，失败 ${fail}`);
process.exit(fail?1:0);
