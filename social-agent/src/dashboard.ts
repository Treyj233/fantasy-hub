export const dashboardHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="robots" content="noindex,nofollow">
  <title>Fantasy Hub — X Drafts</title>
  <style>
    :root{color-scheme:dark;--navy:#051027;--panel:#0b1934;--line:#263b63;--gold:#ffbd18;--blue:#2383e2;--muted:#9fb0cf;--white:#f8fbff;--danger:#ff6b67}
    *{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 85% 0,#12366d 0,transparent 34%),var(--navy);color:var(--white);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;min-height:100vh}
    main{width:min(1100px,calc(100% - 32px));margin:auto;padding:max(28px,env(safe-area-inset-top)) 0 max(48px,env(safe-area-inset-bottom))}
    header{display:flex;align-items:center;justify-content:space-between;gap:24px;margin-bottom:28px}.brand{display:flex;align-items:center;gap:14px}.mark{display:grid;place-items:center;width:52px;height:52px;border-radius:15px;background:linear-gradient(145deg,#246fd0,#073677);font-weight:950;font-style:italic;color:var(--gold);font-size:22px}.eyebrow{margin:0;color:var(--gold);font-size:12px;font-weight:900;letter-spacing:.16em}.title{margin:2px 0 0;font-size:clamp(25px,4vw,40px);line-height:1}.actions{display:flex;gap:10px;flex-wrap:wrap}.button{border:1px solid var(--line);background:#122442;color:var(--white);border-radius:12px;padding:11px 15px;font:inherit;font-weight:800;cursor:pointer}.button.primary{background:var(--gold);border-color:var(--gold);color:#071128}.button:disabled{opacity:.5;cursor:wait}
    .status{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:22px}.metric,.empty,.login{background:rgba(11,25,52,.92);border:1px solid var(--line);border-radius:16px;padding:18px}.metric span{display:block;color:var(--muted);font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.09em}.metric strong{display:block;margin-top:7px;font-size:18px}.dot{display:inline-block;width:9px;height:9px;border-radius:50%;background:#21d28f;margin-right:7px}.drafts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.card{background:linear-gradient(145deg,rgba(17,37,72,.98),rgba(8,23,49,.98));border:1px solid var(--line);border-radius:18px;padding:20px;box-shadow:0 18px 50px rgba(0,0,0,.18)}.card-top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:15px}.badge{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--gold);font-weight:900}.date{font-size:12px;color:var(--muted)}pre{white-space:pre-wrap;word-break:break-word;font:600 15px/1.55 inherit;margin:0}.copy{margin-top:17px;width:100%}.login{max-width:520px;margin:90px auto}.login h2{margin-top:0}.login p,.notice{color:var(--muted);line-height:1.55}.login form{display:flex;gap:10px}.login input{min-width:0;flex:1;border:1px solid var(--line);border-radius:12px;background:#07142d;color:white;padding:12px;font:inherit}.error{color:var(--danger)}.hidden{display:none!important}
    @media(max-width:760px){header{align-items:flex-start;flex-direction:column}.status{grid-template-columns:repeat(2,1fr)}.drafts{grid-template-columns:1fr}.login form{flex-direction:column}}
  </style>
</head>
<body><main>
  <section id="login" class="login">
    <p class="eyebrow">PRIVATE REVIEW</p><h2>Fantasy Hub X Drafts</h2>
    <p>Enter your admin access token. It stays in this browser and is never included in the URL.</p>
    <form id="loginForm"><input id="token" type="password" autocomplete="current-password" placeholder="Admin access token" required><button class="button primary">Open dashboard</button></form>
    <p id="loginError" class="error hidden">That token was not accepted.</p>
  </section>
  <section id="app" class="hidden">
    <header><div class="brand"><div class="mark">FH</div><div><p class="eyebrow">SOCIAL COMMAND CENTER</p><h1 class="title">X Draft Review</h1></div></div><div class="actions"><button id="refresh" class="button">Refresh</button><button id="run" class="button primary">Check for news</button><button id="lock" class="button">Lock</button></div></header>
    <div class="status"><div class="metric"><span>Agent</span><strong><i class="dot"></i>Healthy</strong></div><div class="metric"><span>Mode</span><strong id="mode">—</strong></div><div class="metric"><span>Drafts</span><strong id="count">—</strong></div><div class="metric"><span>Last checked</span><strong id="lastRun">—</strong></div></div>
    <p id="notice" class="notice"></p><div id="drafts" class="drafts"></div>
  </section>
</main><script>
  const login=document.querySelector('#login'),app=document.querySelector('#app'),form=document.querySelector('#loginForm'),tokenInput=document.querySelector('#token'),error=document.querySelector('#loginError'),drafts=document.querySelector('#drafts'),notice=document.querySelector('#notice');
  let token=localStorage.getItem('fh-social-token')||'';
  const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const request=async(path,method='GET')=>{const response=await fetch(path,{method,headers:{authorization:'Bearer '+token}});if(!response.ok)throw new Error(String(response.status));return response.json()};
  const render=status=>{const recent=status.recent||[];document.querySelector('#mode').textContent=(status.state?.mode||'preview').toUpperCase();document.querySelector('#count').textContent=String(recent.length);document.querySelector('#lastRun').textContent=status.state?.lastRunAt?new Date(status.state.lastRunAt).toLocaleString():'Not yet';notice.textContent=status.state?.lastError?'Last error: '+status.state.lastError:(recent.length?'Drafts are newest first. Preview mode will not publish them.':'No qualifying stories have been found yet.');drafts.innerHTML=recent.map(story=>'<article class="card"><div class="card-top"><span class="badge">'+escapeHtml(story.category)+'</span><span class="date">'+escapeHtml(new Date(story.published_at).toLocaleString())+'</span></div><pre>'+escapeHtml(story.draft)+'</pre><button class="button copy" data-copy="'+escapeHtml(story.draft)+'">Copy tweet</button></article>').join('');document.querySelectorAll('[data-copy]').forEach(button=>button.addEventListener('click',async()=>{await navigator.clipboard.writeText(button.dataset.copy);button.textContent='Copied';setTimeout(()=>button.textContent='Copy tweet',1200)}));};
  const open=async()=>{try{render(await request('/admin/status'));localStorage.setItem('fh-social-token',token);login.classList.add('hidden');app.classList.remove('hidden');error.classList.add('hidden')}catch{error.classList.remove('hidden')}};
  form.addEventListener('submit',event=>{event.preventDefault();token=tokenInput.value.trim();open()});
  document.querySelector('#refresh').addEventListener('click',open);document.querySelector('#run').addEventListener('click',async event=>{event.currentTarget.disabled=true;event.currentTarget.textContent='Checking…';try{render(await request('/admin/run','POST'))}finally{event.currentTarget.disabled=false;event.currentTarget.textContent='Check for news'}});document.querySelector('#lock').addEventListener('click',()=>{localStorage.removeItem('fh-social-token');token='';tokenInput.value='';app.classList.add('hidden');login.classList.remove('hidden')});
  if(token)open();
</script></body></html>`;
