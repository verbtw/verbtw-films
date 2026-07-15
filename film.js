const index=Number(new URLSearchParams(location.search).get('id'));
if(!Number.isInteger(index)||!movies[index])location.replace('index.html');
const title=movies[index];
const type=index<4?'Сериал':'Фильм';
const metadataCacheKey='slava-metadata-v5';
const metadata=JSON.parse(localStorage.getItem(metadataCacheKey)||'{}');
const wikiTitleOverrides={'Чернобыль':'Чернобыль (мини-сериал)','Артур, ты король':'Артур, ты король','Общак':'Общак (фильм)','Авиатор':'Авиатор (фильм, 2004)'};
const trailerTitleOverrides={'Чернобыль':'Чернобыль HBO 2019','Артур, ты король':'Arthur the King 2024 Mark Wahlberg','Общак':'The Drop 2014 Tom Hardy','Авиатор':'The Aviator 2004 Leonardo DiCaprio'};
const ratings=JSON.parse(localStorage.getItem('slava-ratings')||'{}');
let ratingApi=null;
if(metadata[title]&&wikiTitleOverrides[title]&&metadata[title].sourceTitle!==wikiTitleOverrides[title]){delete metadata[title];localStorage.setItem(metadataCacheKey,JSON.stringify(metadata));}
const cached=metadata[title]||{};
const $=selector=>document.querySelector(selector);
function returnToCatalog(){
  const cameFromCatalog=document.referrer.startsWith(`${location.origin}/index.html`)||document.referrer===`${location.origin}/`;
  if(cameFromCatalog&&history.length>1)history.back();else location.href='index.html#collection';
}
$('#backToCollection').addEventListener('click',event=>{event.preventDefault();returnToCatalog();});
const genreRules=[['Фантастика',/матриц|интерстеллар|начало|довод|аватар|чуж|терминатор|бегущий|планет.*обезьян|я робот|веном|человек-паук|мир юрского|война миров|исходный код/i],['Криминал',/крестн|казино|славные парни|лицо со шрамом|донни браско|гангстер|криминальное|общак|джон уик|карты деньги|джентельмен|борн|уравнитель|перевозчик|форсаж/i],['Военный',/ярость|дюнкерк|гладиатор|троя|последний самурай|бесславные|морпехи/i],['Ужасы',/пила|мученицы|паранормальное|челюсти|1408|маяк|молчание ягнят/i],['Спорт',/рокки|крид|боец|левша|воин|тренер картер|гонка|f1/i],['Комедия',/мальчишник|такси|третий лишний|полтора шпиона|одноклассники|стажер/i],['Романтика',/500 дней|10 причин|дневник памяти|ла-ла ленд|до встречи|звезда родилась|джо блэк/i],['Фэнтези',/гарри поттер|пираты карибского/i],['Триллер',/семь$|зодиак|пленницы|остров проклятых|бойцовский|моменто|донни дарко|эффект бабочки/i]];
const genre=(genreRules.find(([,rule])=>rule.test(title))||['Драма'])[0];
document.title=`${title} — VERBTW FILMS`;$('#filmTitle').textContent=title;$('#filmType').textContent=type;$('#filmGenre').textContent=genre;$('#filmDirector').textContent=cached.director||'Режиссёр загружается';$('#archiveNumber').textContent=`${String(index+1).padStart(3,'0')} / ${movies.length}`;
function setPoster(url){if(!url)return;$('#poster').innerHTML=`<img src="${url}" alt="Обложка — ${title}">`;$('#pageBackdrop').style.backgroundImage=`linear-gradient(90deg,rgba(3,15,25,.98),rgba(3,18,29,.76),rgba(3,18,29,.42)),url("${url}")`;}
if(cached.poster)setPoster(cached.poster);if(cached.description)$('#description').textContent=cached.description;
function renderRating(){const current=ratings[title];$('#ratingButtons').innerHTML=Array.from({length:10},(_,i)=>`<button data-rating="${i+1}" class="${current===i+1?'selected':''}">${i+1}</button>`).join('');$('#removeRating').hidden=!current;}
function renderCommunitySummary(summary){$('#communityAverage').textContent=summary?.average?.toFixed(1)||'—';$('#communityCount').textContent=summary?.count?`${summary.count} оценок`:'Пока нет оценок';}
async function syncAccountRating(user){
  if(!ratingApi?.available)return;
  if(!user){delete ratings[title];localStorage.setItem('slava-ratings',JSON.stringify(ratings));$('#ratingHelp').textContent='Войди в аккаунт, чтобы оценка сохранилась на всех устройствах.';renderRating();return;}
  const pending=Number(sessionStorage.getItem(`pending-rating:${title}`));
  if(pending){await ratingApi.saveRating(title,pending);sessionStorage.removeItem(`pending-rating:${title}`);ratings[title]=pending;returnToCatalog();}
  else{const cloudRating=await ratingApi.myRating(title);if(cloudRating)ratings[title]=cloudRating;else delete ratings[title];}
  localStorage.setItem('slava-ratings',JSON.stringify(ratings));$('#ratingHelp').textContent='Оценка сохранится в твоём аккаунте.';renderRating();
}
$('#ratingButtons').addEventListener('click',async e=>{if(!e.target.dataset.rating)return;const value=Number(e.target.dataset.rating);ratings[title]=value;localStorage.setItem('slava-ratings',JSON.stringify(ratings));renderRating();ratingApi=ratingApi||await window.communityReady;if(ratingApi?.user){await ratingApi.saveRating(title,value);returnToCatalog();}else{sessionStorage.setItem(`pending-rating:${title}`,String(value));ratingApi?.openAuth('Войди или создай аккаунт, чтобы сохранить оценку.');}});
$('#removeRating').addEventListener('click',async()=>{delete ratings[title];localStorage.setItem('slava-ratings',JSON.stringify(ratings));renderRating();ratingApi=ratingApi||await window.communityReady;if(ratingApi?.user)await ratingApi.removeRating(title);});renderRating();
window.addEventListener('community:ratings',event=>renderCommunitySummary(event.detail.summaries?.[title]));
window.communityReady?.then(async api=>{ratingApi=api;if(!api.available)return;const summaries=await api.loadSummaries();renderCommunitySummary(summaries[title]);api.onAuth(user=>syncAccountRating(user).catch(()=>{}));await syncAccountRating(api.user);}).catch(()=>{});
const preview=$('#trailerPreview');let trailerId='';let trailerPromise;let stopTimer;
function prepareTrailer(){if(!trailerPromise)trailerPromise=fetch(`/api/trailer?title=${encodeURIComponent(trailerTitleOverrides[title]||title)}`).then(r=>{if(!r.ok)throw new Error();return r.json();}).then(result=>trailerId=result.videoId||'');return trailerPromise;}
async function startTrailer(){clearTimeout(stopTimer);if(preview.querySelector('iframe'))return;preview.classList.add('loading');try{await prepareTrailer();if(!trailerId)throw new Error();const frame=document.createElement('iframe');frame.src=`https://www.youtube-nocookie.com/embed/${trailerId}?autoplay=1&mute=1&controls=1&rel=0&playsinline=1`;frame.title=`Трейлер — ${title}`;frame.allow='autoplay; encrypted-media; picture-in-picture';frame.allowFullscreen=true;preview.append(frame);preview.classList.remove('loading');}catch(error){$('#trailerStatus').textContent='Трейлер не найден';preview.classList.add('loading');}}
function stopTrailer(){stopTimer=setTimeout(()=>{preview.querySelector('iframe')?.remove();preview.classList.remove('loading');},500);}
preview.addEventListener('mouseenter',startTrailer);preview.addEventListener('mouseleave',stopTrailer);preview.addEventListener('focus',startTrailer);preview.addEventListener('blur',stopTrailer);preview.addEventListener('click',()=>preview.querySelector('iframe')?null:startTrailer());
prepareTrailer().catch(()=>{});
async function loadDetails(){try{const query=`${title} ${type==='Сериал'?'телесериал':'фильм'}`;const exactWikiTitle=wikiTitleOverrides[title];const pageSelector=exactWikiTitle?`titles=${encodeURIComponent(exactWikiTitle)}`:`generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=1`;const search=await fetch(`https://ru.wikipedia.org/w/api.php?origin=*&action=query&${pageSelector}&prop=pageprops&format=json`).then(r=>r.json());const page=Object.values(search.query?.pages||{})[0];if(!page)throw new Error();const summary=await fetch(`https://ru.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(page.title.replaceAll(' ','_'))}`).then(r=>r.json());const result={poster:summary.originalimage?.source||summary.thumbnail?.source||cached.poster||'',description:summary.extract||cached.description||'',director:cached.director||'',sourceTitle:exactWikiTitle||page.title};const qid=page.pageprops?.wikibase_item;if(qid){const entity=await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`).then(r=>r.json());const id=entity.entities?.[qid]?.claims?.P57?.[0]?.mainsnak?.datavalue?.value?.id;if(id){const person=await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${id}.json`).then(r=>r.json());result.director=person.entities?.[id]?.labels?.ru?.value||person.entities?.[id]?.labels?.en?.value||result.director;}}metadata[title]=result;localStorage.setItem(metadataCacheKey,JSON.stringify(metadata));setPoster(result.poster);$('#description').textContent=result.description||'Описание этого фильма скоро появится.';$('#filmDirector').textContent=result.director||'Режиссёр не указан';}catch(error){if(!cached.description)$('#description').textContent='Описание не загрузилось. Проверь подключение к интернету и обнови страницу.';$('#filmDirector').textContent=cached.director||'Режиссёр не указан';}}loadDetails();
