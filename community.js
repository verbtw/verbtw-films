(function(){
  let client=null;
  let currentUser=null;
  let summaries={};
  const listeners=new Set();
  const $=selector=>document.querySelector(selector);
  const t=(key,values)=>window.i18n.t(key,values);

  function injectAuthDialog(){
    if($('#authDialog'))return;
    document.body.insertAdjacentHTML('beforeend',`<dialog id="authDialog" class="auth-dialog">
      <button class="auth-close" type="button" aria-label="${t('close')}">×</button>
      <p class="auth-eyebrow">${t('community')}</p>
      <h2 id="authTitle">${t('authTitle')}</h2>
      <p id="authLead" class="auth-lead">${t('authLead')}</p>
      <form id="authForm">
        <label id="nameField" hidden><span>${t('nickname')}</span><input id="authName" name="name" minlength="2" maxlength="40" autocomplete="nickname"></label>
        <label><span>${t('email')}</span><input id="authEmail" name="email" type="email" required autocomplete="email"></label>
        <label><span>${t('password')}</span><input id="authPassword" name="password" type="password" required minlength="6" autocomplete="current-password"></label>
        <p id="authMessage" class="auth-message" role="status"></p>
        <button id="authSubmit" class="auth-submit" type="submit">${t('authTitle')}</button>
      </form>
      <button id="authSwitch" class="auth-switch" type="button">${t('createAccount')}</button>
    </dialog>`);
  }

  function userLabel(user){return user?.user_metadata?.display_name||user?.email?.split('@')[0]||t('profile');}
  function updateAuthUi(){
    document.querySelectorAll('[data-auth-open]').forEach(el=>el.hidden=!!currentUser);
    document.querySelectorAll('[data-user-menu]').forEach(el=>el.hidden=!currentUser);
    document.querySelectorAll('[data-user-name]').forEach(el=>el.textContent=userLabel(currentUser));
  }
  function notifyAuth(){updateAuthUi();listeners.forEach(fn=>fn(currentUser));window.dispatchEvent(new CustomEvent('community:auth',{detail:{user:currentUser}}));}
  function openAuth(message=''){const dialog=$('#authDialog');if(!dialog)return;$('#authMessage').textContent=message;dialog.showModal();}

  async function loadSummaries(){
    if(!client)return summaries;
    const {data,error}=await client.rpc('get_rating_summaries');
    if(error)throw error;
    summaries=Object.fromEntries((data||[]).map(row=>[row.movie_title,{average:Number(row.average_rating),count:Number(row.rating_count)}]));
    window.dispatchEvent(new CustomEvent('community:ratings',{detail:{summaries}}));
    return summaries;
  }
  async function myRating(title){
    if(!client||!currentUser)return null;
    const {data,error}=await client.from('ratings').select('rating').eq('user_id',currentUser.id).eq('movie_title',title).maybeSingle();
    if(error)throw error;
    return data?.rating||null;
  }
  async function myRatings(){
    if(!client||!currentUser)return {};
    const {data,error}=await client.from('ratings').select('movie_title,rating').eq('user_id',currentUser.id);
    if(error)throw error;
    return Object.fromEntries((data||[]).map(row=>[row.movie_title,row.rating]));
  }
  async function saveRating(title,rating){
    if(!client||!currentUser){openAuth(t('signInSave'));return false;}
    const {error}=await client.from('ratings').upsert({user_id:currentUser.id,movie_title:title,rating},{onConflict:'user_id,movie_title'});
    if(error)throw error;
    await loadSummaries();return true;
  }
  async function saveRatings(ratings){
    if(!client||!currentUser)return false;
    const rows=Object.entries(ratings).map(([movie_title,rating])=>({user_id:currentUser.id,movie_title,rating}));
    if(!rows.length)return true;
    const {error}=await client.from('ratings').upsert(rows,{onConflict:'user_id,movie_title'});
    if(error)throw error;
    await loadSummaries();return true;
  }
  async function removeRating(title){
    if(!client||!currentUser)return false;
    const {error}=await client.from('ratings').delete().eq('user_id',currentUser.id).eq('movie_title',title);
    if(error)throw error;
    await loadSummaries();return true;
  }

  async function init(){
    injectAuthDialog();
    let registerMode=false;
    const dialog=$('#authDialog');
    function translateAuth(){
      $('#authTitle').textContent=registerMode?t('createAccount'):t('authTitle');
      $('#authLead').textContent=registerMode?t('registerLead'):t('authLead');
      $('#authSubmit').textContent=registerMode?t('register'):t('authTitle');
      $('#authSwitch').textContent=registerMode?t('haveAccount'):t('createAccount');
      const labels=dialog.querySelectorAll('form label span');labels[0].textContent=t('nickname');labels[1].textContent=t('email');labels[2].textContent=t('password');
      $('.auth-close').setAttribute('aria-label',t('close'));
    }
    window.addEventListener('languagechange',translateAuth);
    $('.auth-close').addEventListener('click',()=>dialog.close());
    dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
    document.querySelectorAll('[data-auth-open]').forEach(button=>button.addEventListener('click',()=>openAuth()));
    document.querySelectorAll('[data-logout]').forEach(button=>button.addEventListener('click',async()=>{if(client)await client.auth.signOut();}));
    $('#authSwitch').addEventListener('click',()=>{
      registerMode=!registerMode;
      $('#authTitle').textContent=registerMode?t('createAccount'):t('authTitle');
      $('#authLead').textContent=registerMode?t('registerLead'):t('authLead');
      $('#nameField').hidden=!registerMode;
      $('#authSubmit').textContent=registerMode?t('register'):t('authTitle');
      $('#authSwitch').textContent=registerMode?t('haveAccount'):t('createAccount');
      $('#authPassword').autocomplete=registerMode?'new-password':'current-password';
      $('#authMessage').textContent='';
    });

    const config=await fetch('/api/config').then(response=>response.json()).catch(()=>({configured:false}));
    if(!config.configured||!window.supabase){
      $('#authMessage').textContent=t('comingSoon');
      return {available:false,user:null,loadSummaries:async()=>({}),myRating:async()=>null,myRatings:async()=>({}),saveRating:async()=>false,saveRatings:async()=>false,removeRating:async()=>false,openAuth,onAuth:()=>{}};
    }
    client=window.supabase.createClient(config.supabaseUrl,config.supabaseAnonKey);
    const {data:{session}}=await client.auth.getSession();currentUser=session?.user||null;notifyAuth();
    client.auth.onAuthStateChange((_event,sessionValue)=>{currentUser=sessionValue?.user||null;notifyAuth();});

    $('#authForm').addEventListener('submit',async event=>{
      event.preventDefault();
      const email=$('#authEmail').value.trim();const password=$('#authPassword').value;const name=$('#authName').value.trim();
      const message=$('#authMessage');const submit=$('#authSubmit');message.textContent='';submit.disabled=true;
      try{
        if(registerMode){
          if(name.length<2)throw new Error(t('nicknameError'));
          const {data,error}=await client.auth.signUp({email,password,options:{data:{display_name:name}}});if(error)throw error;
          if(!data.session){message.textContent=t('checkEmail');}else{dialog.close();}
        }else{
          const {error}=await client.auth.signInWithPassword({email,password});if(error)throw error;dialog.close();
        }
      }catch(error){message.textContent=error.message||t('authError');}finally{submit.disabled=false;}
    });

    const api={
      available:true,
      get user(){return currentUser;},
      loadSummaries,
      get summaries(){return summaries;},
      myRating,myRatings,saveRating,saveRatings,removeRating,openAuth,
      onAuth(fn){listeners.add(fn);return()=>listeners.delete(fn);}
    };
    return api;
  }
  window.communityReady=init();
})();
