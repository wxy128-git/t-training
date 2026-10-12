/* 科研方法文稿呈现：纯字符串函数，模型字段先由 ResearchCore 规范化。 */
(function(root){
    const C=root.ResearchCore,E=v=>root.SafeRender.escape(String(v??'')),LABELS=C.METHOD_LABELS;
    const section=(title,body)=>`<section class="rs-method-section"><h3>${E(title)}</h3>${body}</section>`;
    const list=values=>`<ul>${values.map(v=>`<li>${E(v)}</li>`).join('')}</ul>`;
    const button=(key,copy,attrs='')=>`<button type="button" class="rs-btn" ${attrs}>${E(copy[key])}</button>`;
    const dl=values=>`<dl class="rs-method-facts">${values.map(([k,v])=>`<div><dt>${E(k)}</dt><dd>${E(v)}</dd></div>`).join('')}</dl>`;
    function table(headers,rows,cls=''){return `<div class="rs-table-scroll ${cls}" tabindex="0"><table><thead><tr>${headers.map(h=>`<th scope="col">${E(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map((v,i)=>`<td data-label="${E(headers[i])}">${v}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;}
    function designHTML(d,ctx,copy,options={}){
        const detail=(title,body,cls='')=>`<details class="rs-design-detail ${cls}"><summary>${E(title)}</summary><div>${body}</div></details>`;
        const question=d.scope.narrowed||ctx?.question||d.analysis.focus;
        let body=`<header class="rs-design-decision"><span class="rs-method-status ${d.scope.status==='可行'?'rs-method-success':'rs-method-warning'}">${E(d.scope.status)}</span><h3>${E(question)}</h3><p>${E(d.scope.reason)}</p>${d.scope.status==='需回到教练'?button('designToCoachAction',copy,'data-method-action="coach"'):''}</header>`;
        if(d.scope.status!=='需回到教练'){
            if(d.titleCheck.title!=='未提供'&&d.titleCheck.conflict&&d.titleCheck.conflict!=='无明显冲突')body+=`<p class="rs-method-warning"><strong>${E(copy.designTitleHeading)}</strong>：${E(d.titleCheck.conflict)}${d.titleCheck.suggestion?`<br>${E(d.titleCheck.suggestion)}`:''}</p>`;
            body+=section(copy.designRecommendedHeading,d.recommended.map(r=>`<div class="rs-design-method"><div class="rs-design-method-heading"><h4>${E(r.method)}</h4><span>${E(r.role)}</span></div><p>${E(r.why)}</p><div class="rs-method-minimal"><strong>${E(copy.designMinimalLabel)}</strong><p>${E(r.minimal)}</p></div>${r.limits?`<p class="rs-design-limit"><strong>本案局限：</strong>${E(r.limits)}</p>`:''}</div>`).join(''));
            body+=section(copy.designPlanHeading,`<ol class="rs-design-plan">${d.plan.map((r,i)=>`<li><div class="rs-design-plan-heading"><span>${i+1}</span><h4>${E(r.subQuestion)}</h4></div><p class="rs-design-plan-action">${E(r.approach)}</p><p class="rs-design-plan-meta"><strong>时间：</strong>${E(r.timing)}<br><strong>分析：</strong>${E(r.analysis)}</p>${['问卷','访谈提纲','观察记录表'].includes(r.toolType)?`<div class="rs-design-plan-tool" aria-label="${E(copy.designToolsHeading)}"><span>${E(r.tool)}</span>${button('designToWorkshopAction',copy,`data-design-row="${i}"`)}</div>`:r.toolType==='现有材料'?`<p class="rs-design-material">${E(copy.designExistingMaterial.replace('{source}',r.source))}</p>`:''}</li>`).join('')}</ol>`);
        }
        if(d.ethics.length)body+=section(copy.designEthicsHeading,list(d.ethics));if(d.pending.length)body+=section(copy.designPendingHeading,list(d.pending));
        let full=section(copy.designAnalysisHeading,dl([['研究对象',d.analysis.object],['关键变量或现象',d.analysis.focus],['研究情境',d.analysis.context],['问题类型',d.analysis.questionType],['判断依据',d.analysis.typeReason]]));
        full+=section(copy.designScopeHeading,`<p>${E(d.scope.status)}：${E(d.scope.reason)}</p>`);
        if(d.scope.status!=='需回到教练'){
            full+=section(copy.designRecommendedHeading,d.recommended.map(r=>`<h4>${E(r.method)}</h4>${dl([['会产生的数据',r.data]])}`).join(''));
            if(d.titleCheck.title!=='未提供')full+=section(copy.designTitleHeading,dl([['拟定题目',d.titleCheck.title],['题目承诺的证据',d.titleCheck.implies],['与条件的冲突',d.titleCheck.conflict],['修改建议',d.titleCheck.suggestion]]));
            if(d.notRecommended.length)full+=section(copy.designExcludedHeading,list(d.notRecommended.map(r=>r.method+'：'+r.reason)));
            full+=section(copy.designPlanHeading,table(C.DESIGN_HEADERS,d.plan.map(r=>C.PLAN_KEYS.map(k=>E(r[k]))),'rs-design-table'));
        }
        body+=detail(copy.designDetailsAction,full,'rs-design-full');
        return `<article class="rs-method-document rs-design-document">${options.warnings?.length?`<p class="rs-method-warning" role="alert">${E(copy.missingFieldsHint.replace('{fields}',options.warnings.map(k=>({analysis:'问题解析',scope:'范围检查',titleCheck:'题目承诺检查',recommended:'推荐方法',notRecommended:'不推荐的方法',plan:'一页纸设计',ethics:'伦理提醒',pending:'待核实'})[k]||k).join('、')))}</p>`:''}${options.readOnly?`<p>${E(copy.designReadOnlyHint)}</p>`:''}${body}</article>`;
    }
    const edit=(path,value,label,max=200)=>`<label class="rs-method-edit"><span>${E(label)}</span><textarea data-inst-path="${E(path)}" maxlength="${max}">${E(value)}</textarea></label>`;
    const select=(path,value,values,label)=>`<label>${E(label)}<select data-inst-path="${E(path)}">${values.map(v=>`<option${v===value?' selected':''}>${E(v)}</option>`).join('')}</select></label>`;
    function entryHTML(inst,e,copy){const count=inst.review.filter(r=>r.itemId===e.id&&r.status==='未处理').length;return `<div class="rs-instrument-entry" id="rs-entry-${E(e.id)}"><span class="rs-entry-id">${E(e.id)}</span><textarea data-entry="${E(e.id)}" maxlength="150" aria-label="${E(e.id)}">${E(e.text)}</textarea><div class="rs-entry-actions">${count?`<button class="rs-btn" type="button" data-review-locate="${E(e.id)}">${count} 条</button>`:''}${button('deleteItemAction',copy,`data-remove-entry="${E(e.id)}"`)}</div></div>`;}
    function reviewHTML(inst,copy,summary=''){
        const entries=new Map(C.instrumentEntries(inst).map(e=>[e.id,e.text]));
        const rows=inst.review.map((r,i)=>{const current=entries.get(r.itemId),stale=current!==r.original;let operation='';
            if(r.status==='已采用')operation=`<span>${E(copy.adoptedLabel)}</span>`;else if(r.status==='条目已删除')operation=`<span>${E(copy.removedLabel)}</span>`;else if(stale)operation=`<span>${E(copy.reviewStale)}</span>`;else if(['改写','删除'].includes(r.action))operation=button(r.action==='删除'?'adoptDeleteAction':'adoptAction',copy,`data-adopt="${i}"`);
            operation+=button('locateAction',copy,`data-locate-entry="${E(r.itemId)}"`);
            return ['itemId','issue','original','action','suggestion','reason'].map(k=>E(r[k])).concat(operation);});
        return `${summary?`<p><strong>${E(copy.reviewSummaryLabel)}</strong> ${E(summary)}</p>`:''}${rows.length?table(['编号','问题类型','原句','处理','建议','理由','操作'],rows,'rs-review-table'):`<p>${E(copy.reviewEmpty)}</p>`}`;
    }
    function instrumentHTML(inst,ctx,copy,state={}){
        const entries=C.instrumentEntries(inst),entry=id=>entryHTML(inst,entries.find(e=>e.id===id),copy),add=(type,group='',blockId='')=>button(type==='probe'?'addProbeAction':type==='block'?'addBlockAction':'addItemAction',copy,`data-add-entry="${E(type)}" data-group="${E(group)}" data-block="${E(blockId)}"`);
        let editor=edit('title',inst.title,'标题');
        if(inst.kind==='questionnaire'){
            editor+=section(LABELS.instructions,edit('instructions',inst.instructions,LABELS.instructions));editor+=section('选项',`<p>${E(inst.scale.type)}：${E(inst.scale.labels.join('、'))}</p>`);
            editor+=section(LABELS.demographics,`<ul>${inst.demographics.map((d,i)=>`<li>${E(d.label)}：${E(d.options.join('、'))} <button type="button" class="rs-btn" data-remove-demographic="${i}">${E(copy.deleteItemAction)}</button></li>`).join('')}</ul>`);
            editor+=section(LABELS.dimensions,inst.dimensions.map((d,i)=>`<div>${edit(`dimensions.${i}.name`,d.name,'维度名称')}${edit(`dimensions.${i}.definition`,d.definition,'含义')}<p>${E(d.source)}</p></div>`).join('')+(inst.dimensions.some(d=>d.source==='AI拟定')?button('useDimensionsAction',copy,'data-method-action="dimensions"'):''));
            const groups=[...new Set([...inst.dimensions.map(d=>d.name),...inst.items.map(i=>i.dimension)])];editor+=groups.map(group=>section(group,inst.items.filter(i=>i.dimension===group).map(i=>entry(i.id)+`<label class="rs-method-inline"><input type="checkbox" data-inst-path="items.${inst.items.indexOf(i)}.reverse" ${i.reverse?'checked':''}>反向题</label>`).join('')+add('item',group))).join('');
        }else if(inst.kind==='interview'){
            editor+=section(LABELS.opening,edit('opening',inst.opening,LABELS.opening,400))+section(LABELS.consentPoints,list(inst.consentPoints));editor+=section(LABELS.warmup,inst.warmup.map(i=>entry(i.id)).join('')+add('warmup'));
            editor+=inst.blocks.map((b,i)=>section(LABELS.blocks+' '+b.id,edit(`blocks.${i}.topic`,b.topic,'话题')+entry(b.id)+b.probes.map(p=>entry(p.id)).join('')+add('probe','',b.id))).join('')+add('block');
            editor+=section(LABELS.closing,(inst.closing?entry(inst.closing.id):add('closing')))+section(LABELS.closingStatement,edit('closingStatement',inst.closingStatement,LABELS.closingStatement))+section(LABELS.fieldNotes,list(inst.fieldNotes));
        }else{
            editor+=dl([['观察场景',inst.scene],['观察对象',inst.target],['观察者',inst.observer]]);editor+=section(LABELS.sampling,`<p>${E(inst.sampling.mode)}</p>${edit('sampling.rule',inst.sampling.rule,'取样规则')}<label>记录时间点<input data-inst-slots value="${E(inst.sampling.slots.join('、'))}"></label>`);
            editor+=inst.dimensions.map((d,di)=>section(d.name,d.indicators.map((i,ii)=>entry(i.id)+select(`dimensions.${di}.indicators.${ii}.record`,i.record,['勾选','计数','等级'],'记录方式')+`<div data-levels-for="${E(i.id)}" ${i.record!=='等级'?'hidden':''}>${[0,1,2].map(n=>edit(`dimensions.${di}.indicators.${ii}.levels.${n}`,i.levels[n]||'',`${n+1}级标准`)).join('')}</div>`).join('')+add('indicator',d.name))).join('');
            editor+=section(LABELS.recordingRules,list(inst.recordingRules))+section(LABELS.agreement,`<p>${E(inst.agreement)}</p>`)+section(copy.designEthicsHeading,list(inst.ethics));
        }
        let body=`<div class="rs-instrument-editor"><fieldset ${state.busy?'disabled':''}>${editor}</fieldset></div>`;
        body+=`<section class="rs-method-section" id="rs-method-review"><h3 tabindex="-1">${E(copy.reviewHeading)}</h3>${reviewHTML(inst,copy,state.summary)}</section><section class="rs-method-section"><h3>${E(copy.checksHeading)}</h3><div id="rs-method-checks">${checksHTML(inst,ctx,copy)}</div></section>`;
        if(inst.kind==='questionnaire')body+=section(copy.administrationHeading,dl([['试测建议',inst.administration.pilot],['预计用时',inst.administration.duration]])+list(inst.administration.notes))+`<details class="rs-details"><summary>${E(copy.reliabilityHeading)}</summary><p>${E(copy.reliabilityGuide)}</p></details>`;
        if(inst.pending.length)body+=section(copy.designPendingHeading,list(inst.pending));
        return `<article class="rs-method-document">${state.warnings?.length?`<p class="rs-method-warning">${E(copy.missingFieldsHint.replace('{fields}',state.warnings.join('、')))}</p>`:''}${inst.adaptationNotice?`<div class="rs-method-warning"><strong>${E(copy.adaptationLabel)}</strong><p>${E(inst.adaptationNotice)}</p></div>`:''}${body}</article>`;
    }
    function checksHTML(inst,ctx,copy){const hints=C.instrumentChecks(inst,ctx);return hints.length?list(hints):`<p>${E(copy.checksEmpty)}</p>`;}
    function printDocument(inst,ctx,copy){inst=C.compactInstrument(inst);let html=`<article class="rs-print-document"><h1>${E(inst.title)}</h1>`;
        const lines='<div class="rs-print-lines"><hr><hr><hr></div>',questions=entries=>entries.map(e=>`<section><p><strong>${E(e.id)}</strong> ${E(e.text)}</p>${lines}</section>`).join('');
        if(inst.kind==='questionnaire'){
            html+=`<p>${E(inst.instructions)}</p>${inst.demographics.map(d=>`<p>${E(d.label)}： ${d.options.map(v=>'□ '+E(v)).join('　')}</p>`).join('')}`;
            html+=table(['题号','题目',...inst.scale.labels],inst.items.map((i,n)=>[E(n+1),E(i.text),...inst.scale.labels.map(()=>'□')]));html+=`<p>${E(copy.printThanks)}</p>`;
        }else if(inst.kind==='interview'){
            html+='<p>日期：________　受访者编号：________　访谈者：________</p>'+section(LABELS.opening,`<p>${E(inst.opening)}</p>`)+section(LABELS.consentPoints,list(inst.consentPoints.map(s=>'□ '+s)))+section(LABELS.warmup,questions(inst.warmup));
            html+=inst.blocks.map(b=>section(b.topic,questions([{id:b.id,text:b.main},...b.probes]))).join('');if(inst.closing)html+=section(LABELS.closing,questions([inst.closing]));html+=section(LABELS.closingStatement,`<p>${E(inst.closingStatement)}</p>`)+section(LABELS.fieldNotes,list(inst.fieldNotes));
        }else{
            html+='<p>日期：______　班级：______　观察者：______　对象编号：______　开始时间：______</p>';const slots=inst.sampling.slots.length?inst.sampling.slots:['1','2','3','4','5','6'];
            html+=table(['编号','维度','观察行为','记录方式',...slots],inst.dimensions.flatMap(d=>d.indicators.map(i=>[E(i.id),E(d.name),E(i.behavior)+(i.record==='等级'?`<small>${i.levels.map((s,n)=>E(`${n+1}级：${s}`)).join('<br>')}</small>`:''),E(i.record),...slots.map(()=>'')])));
            html+=section(LABELS.sampling,`<p>${E(inst.sampling.mode)}：${E(inst.sampling.rule)}</p>`)+section(LABELS.recordingRules,list(inst.recordingRules));
        }return {html:html+'</article>',landscape:inst.kind==='observation'};
    }
    root.ResearchMethods={designHTML,instrumentHTML,printDocument,LABELS,checksHTML,reviewHTML};
})(globalThis);
