const ratings = JSON.parse(localStorage.getItem('slava-ratings') || '{}');
const metadataCacheKey = 'slava-metadata-v5';
const metadata = JSON.parse(localStorage.getItem(metadataCacheKey) || '{}');
const imdbCache = JSON.parse(localStorage.getItem('verbtw-imdb-v1') || '{}');
const imdbRequests = new Map();
let communityRatings = {};
const wikiTitleOverrides = {'Чернобыль':'Чернобыль (мини-сериал)','Артур, ты король':'Артур, ты король','Общак':'Общак (фильм)'};
let activeFilter = 'all';
let selectedTitle = null;
const $ = selector => document.querySelector(selector);
const grid = $('#grid');
const search = $('#search');
const sort = $('#sort');
const sortDirection = $('#sortDirection');
const sortDirectionWrap = $('#sortDirectionWrap');
const contentTypeSelect = $('#contentType');
const genreSelect = $('#genre');
const directorSelect = $('#director');
const ratingDialog = $('#ratingDialog');
const detailsDialog = $('#detailsDialog');

const genreRules = [
  ['Фантастика', /матриц|интерстеллар|начало|довод|аватар|чуж|терминатор|бегущий|планет.*обезьян|я робот|веном|человек-паук|мир юрского|война миров|исходный код/i],
  ['Криминал', /крестн|казино|славные парни|лицо со шрамом|донни браско|гангстер|криминальное|общак|джон уик|карты деньги|джентельмен|рок-н-рольщик|борн|уравнитель|перевозчик|форсаж/i],
  ['Военный', /ярость|дюнкерк|300 спартанцев|гладиатор|троя|последний самурай|бесславные|переводчик|морпехи|освобождение/i],
  ['Ужасы', /пила|мученицы|паранормальное|челюсти|1408|маяк|вампир|молчание ягнят/i],
  ['Спорт', /рокки|крид|боец|левша|воин|тренер картер|нба|ford|гонка|f1|топ ган/i],
  ['Комедия', /мальчишник|такси|третий лишний|полтора шпиона|спасатели малибу|одноклассники|папе снова 17|стажер/i],
  ['Романтика', /500 дней|10 причин|дневник памяти|ла-ла ленд|до встречи|звезда родилась|джо блэк|как отделаться|семьянин/i],
  ['Фэнтези', /гарри поттер|пираты карибского/i],
  ['Триллер', /семь$|зодиак|пленницы|остров проклятых|бойцовский|моменто|донни дарко|эффект бабочки|игра$|враг|ветреная река/i]
];
const directorRules = [
  ['Кристофер Нолан', /оппенгеймер|интерстеллар|начало|дюнкерк|довод|престиж|тёмный рыцарь|бэтмен: начало/i],
  ['Квентин Тарантино', /однажды в… голливуде|бесславные ублюдки|джанго|омерзительная|криминальное чтиво|убить билла/i],
  ['Мартин Скорсезе', /отступники|волк с уолл|остров проклятых|убийцы цветочной|авиатор|ирландец|славные парни|казино/i],
  ['Дэвид Финчер', /бойцовский клуб|семь$|зодиак|социальная сеть|загадочная история/i],
  ['Гай Ричи', /большой куш|карты деньги|джентельмены|рок-н-рольщик|револьвер|гнев человеческий/i],
  ['Джеймс Кэмерон', /титаник|аватар|терминатор/i],
  ['Стивен Спилберг', /поймай меня|спасти рядового|война миров/i],
  ['Фрэнсис Форд Коппола', /крестный отец/i]
];
const genreFor = title => (genreRules.find(([,rule]) => rule.test(title)) || ['Драма'])[0];
const directorFor = title => metadata[title]?.director || (directorRules.find(([,rule]) => rule.test(title)) || ['Другие режиссёры'])[0];
const normalized = movies.map((title,index) => ({title,index,type:index<4?'series':'movie',genre:genreFor(title),director:directorFor(title)}));

function escapeHtml(value){const el=document.createElement('div');el.textContent=value;return el.innerHTML;}
function hue(title){return [...title].reduce((n,c)=>n+c.charCodeAt(0),0)%360;}
function compareByRating(a,b,getRating,direction){
  const aRating=getRating(a);const bRating=getRating(b);const aRated=Number.isFinite(aRating);const bRated=Number.isFinite(bRating);
  if(aRated!==bRated)return aRated?-1:1;
  if(!aRated)return a.title.localeCompare(b.title,'ru');
  const difference=direction==='asc'?aRating-bRating:bRating-aRating;
  return difference||a.title.localeCompare(b.title,'ru');
}
function refreshSelects(){
  const genreValue=genreSelect.value||'all';
  genreSelect.innerHTML='<option value="all">все жанры</option>'+[...new Set(normalized.map(x=>x.genre))].sort((a,b)=>a.localeCompare(b,'ru')).map(x=>`<option>${escapeHtml(x)}</option>`).join('');
  genreSelect.value=genreValue;
  const directorValue=directorSelect.value||'all';
  directorSelect.innerHTML='<option value="all">все режиссёры</option>'+[...new Set(normalized.map(x=>x.director))].sort((a,b)=>a.localeCompare(b,'ru')).map(x=>`<option>${escapeHtml(x)}</option>`).join('');
  directorSelect.value=directorValue;
}
function render(){
  const term=search.value.trim().toLocaleLowerCase('ru');
  let list=normalized.filter(item=>{
    const typeOk=contentTypeSelect.value==='all'||item.type===contentTypeSelect.value;
    return typeOk&&(genreSelect.value==='all'||item.genre===genreSelect.value)&&(directorSelect.value==='all'||item.director===directorSelect.value)&&item.title.toLocaleLowerCase('ru').includes(term);
  });
  if(sort.value==='az')list.sort((a,b)=>a.title.localeCompare(b.title,'ru'));
  if(sort.value==='imdb')list.sort((a,b)=>compareByRating(a,b,item=>{
    const value=Number(imdbCache[item.title]?.rating);
    return Number.isFinite(value)&&value>0?value:NaN;
  },sortDirection.value));
  grid.innerHTML=list.map(item=>{
    const meta=metadata[item.title]; const poster=meta?.poster;
    return `<a class="film-card" data-index="${item.index}" href="film.html?id=${item.index}" style="--card-hue:${hue(item.title)}" aria-label="Открыть страницу фильма: ${escapeHtml(item.title)}">
      <div class="poster-wrap">${poster?`<img src="${escapeHtml(poster)}" alt="Обложка — ${escapeHtml(item.title)}" loading="lazy">`:`<div class="poster-placeholder"><b>${escapeHtml(item.title.slice(0,1))}</b><span>Загрузка обложки</span></div>`}<div class="poster-shade"></div><span class="card-number">${String(item.index+1).padStart(3,'0')}</span><span class="imdb-badge" aria-label="Оценка IMDb"><b>IMDb</b><span data-imdb>${imdbCache[item.title]?.rating||'—'}</span></span></div>
      <div class="card-body"><div class="film-card__meta"><span>${item.genre}</span><span>${item.type==='series'?'Сериал':'Фильм'}</span></div><h3>${escapeHtml(item.title)}</h3><div class="card-director">${escapeHtml(item.director)}</div><div class="community-score"><b>VERBTW</b><span>${communityRatings[item.title]?.average?.toFixed(1)||'—'}</span><small>${communityRatings[item.title]?.count?`${communityRatings[item.title].count} оценок`:'нет оценок'}</small></div><div class="card-footer"><span>Открыть страницу</span><span class="card-arrow">↗</span></div></div>
    </a>`;
  }).join('');
  $('#resultText').textContent=`Показано ${list.length} из ${normalized.length}`;
  grid.hidden=!list.length;$('#empty').hidden=!!list.length;
  observePosters();
}
function updateStats(){
  $('#totalTop').textContent=normalized.length;$('#movieCount').textContent=normalized.filter(x=>x.type==='movie').length;$('#seriesCount').textContent=normalized.filter(x=>x.type==='series').length;$('#ratedCount').textContent=Object.keys(ratings).length;
}
async function fetchMetadata(item){
  if(metadata[item.title]?.description&&metadata[item.title]?.poster)return metadata[item.title];
  try{
    const query=`${item.title} ${item.type==='series'?'телесериал':'фильм'}`;
    const exactWikiTitle=wikiTitleOverrides[item.title];
    const pageSelector=exactWikiTitle?`titles=${encodeURIComponent(exactWikiTitle)}`:`generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=1`;
    const url=`https://ru.wikipedia.org/w/api.php?origin=*&action=query&${pageSelector}&prop=pageimages%7Cextracts%7Cpageprops&piprop=thumbnail&pithumbsize=700&exintro=1&explaintext=1&exsentences=4&format=json`;
    const json=await fetch(url).then(r=>r.json());
    const page=Object.values(json.query?.pages||{})[0];
    if(!page)throw new Error('not found');
    let summary={};
    try{summary=await fetch(`https://ru.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(page.title.replaceAll(' ','_'))}`).then(r=>r.json());}catch(error){}
    const result={poster:summary.originalimage?.source||summary.thumbnail?.source||page.thumbnail?.source||'',description:summary.extract||page.extract||'',director:item.director};
    const qid=page.pageprops?.wikibase_item;
    if(qid){
      const entity=await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`).then(r=>r.json());
      const directorId=entity.entities?.[qid]?.claims?.P57?.[0]?.mainsnak?.datavalue?.value?.id;
      if(directorId){
        const person=await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${directorId}.json`).then(r=>r.json());
        result.director=person.entities?.[directorId]?.labels?.ru?.value||person.entities?.[directorId]?.labels?.en?.value||result.director;
      }
    }
    metadata[item.title]=result;item.director=result.director;
    localStorage.setItem(metadataCacheKey,JSON.stringify(metadata));
    return result;
  }catch(error){return metadata[item.title]||{poster:'',description:'Описание пока не загрузилось. Проверь подключение к интернету.',director:item.director};}
}
async function fetchImdb(item){
  if(imdbCache[item.title]?.rating)return imdbCache[item.title];
  if(imdbRequests.has(item.title))return imdbRequests.get(item.title);
  const request=(async()=>{try{
    const response=await fetch(`/api/imdb?title=${encodeURIComponent(item.title)}&type=${item.type}`);
    if(!response.ok)throw new Error('IMDb unavailable');
    const result=await response.json();
    imdbCache[item.title]=result;
    localStorage.setItem('verbtw-imdb-v1',JSON.stringify(imdbCache));
    return result;
  }catch(error){return {rating:''};}finally{imdbRequests.delete(item.title);}})();
  imdbRequests.set(item.title,request);
  return request;
}
let imdbLoading=false;
async function loadImdbForSorting(){
  if(imdbLoading)return;
  const missing=normalized.filter(item=>!imdbCache[item.title]?.rating);
  if(!missing.length)return render();
  imdbLoading=true;
  const option=sort.querySelector('option[value="imdb"]');
  const total=missing.length;
  let completed=0;
  const workers=Array.from({length:Math.min(8,missing.length)},async()=>{
    while(missing.length){
      const item=missing.shift();
      await fetchImdb(item);
      completed+=1;
      option.textContent=`IMDb · загрузка ${completed}/${total}`;
      if(sort.value==='imdb'&&(completed%8===0||!missing.length))render();
    }
  });
  await Promise.all(workers);
  option.textContent='по оценке IMDb';
  imdbLoading=false;
  if(sort.value==='imdb')render();
}
function updateSortControls(){
  const imdbSelected=sort.value==='imdb';
  sortDirectionWrap.hidden=!imdbSelected;
  if(imdbSelected)loadImdbForSorting();
}
let posterObserver;
function observePosters(){
  posterObserver?.disconnect();
  posterObserver=new IntersectionObserver(entries=>entries.forEach(async entry=>{
    if(!entry.isIntersecting)return;posterObserver.unobserve(entry.target);
    const item=normalized[Number(entry.target.dataset.index)];const [meta,imdb]=await Promise.all([fetchMetadata(item),fetchImdb(item)]);
    if(meta.poster&&!entry.target.querySelector('img')){const wrap=entry.target.querySelector('.poster-wrap');const placeholder=wrap.querySelector('.poster-placeholder');const img=new Image();img.alt=`Обложка — ${item.title}`;img.loading='lazy';img.onload=()=>{placeholder?.remove();wrap.prepend(img);};img.src=meta.poster;}
    const name=entry.target.querySelector('.card-director');if(name)name.textContent=item.director;
    const imdbValue=entry.target.querySelector('[data-imdb]');if(imdbValue&&imdb.rating)imdbValue.textContent=imdb.rating;
    refreshSelects();
  }),{rootMargin:'500px 0px'});
  grid.querySelectorAll('.film-card').forEach(card=>posterObserver.observe(card));
}
function openRating(title){selectedTitle=title;$('#dialogTitle').textContent=title;$('#ratingButtons').innerHTML=Array.from({length:10},(_,i)=>`<button data-rating="${i+1}" class="${ratings[title]===i+1?'selected':''}">${i+1}</button>`).join('');$('#removeRating').hidden=!ratings[title];ratingDialog.showModal();}
async function openDetails(item){
  const cached=metadata[item.title];
  $('#detailsNumber').textContent=`FILMS · ${String(item.index+1).padStart(3,'0')}`;$('#detailsTitle').textContent=item.title;$('#detailsType').textContent=item.type==='series'?'Сериал':'Фильм';$('#detailsGenre').textContent=item.genre;$('#detailsDirector').textContent=item.director;$('#detailsDescription').textContent=cached?.description||`${item.title} — ${item.genre.toLocaleLowerCase('ru')} из личной коллекции Славы. Загружаю полное описание фильма…`;$('#detailsLoading').hidden=!!cached?.description;
  $('#detailsBackdrop').style.backgroundImage=cached?.poster?`url("${cached.poster}")`:`linear-gradient(135deg,hsl(${hue(item.title)} 45% 28%),#121522)`;
  $('#trailerLink').href=`https://www.youtube.com/results?search_query=${encodeURIComponent(item.title+' официальный трейлер русский')}`;
  const rate=$('#detailsRate');rate.textContent=ratings[item.title]?`Моя оценка: ${ratings[item.title]}/10`:'Поставить оценку';rate.onclick=()=>{detailsDialog.close();openRating(item.title);};if(!detailsDialog.open)detailsDialog.showModal();
  const meta=await fetchMetadata(item);if(!detailsDialog.open)return;
  $('#detailsLoading').hidden=true;$('#detailsDescription').textContent=meta.description||'Описание этого фильма скоро появится в архиве.';$('#detailsDirector').textContent=meta.director;if(meta.poster)$('#detailsBackdrop').style.backgroundImage=`url("${meta.poster}")`;refreshSelects();
}
$('#ratingButtons').addEventListener('click',e=>{if(!e.target.dataset.rating)return;ratings[selectedTitle]=Number(e.target.dataset.rating);localStorage.setItem('slava-ratings',JSON.stringify(ratings));ratingDialog.close();updateStats();render();});
$('#removeRating').addEventListener('click',()=>{delete ratings[selectedTitle];localStorage.setItem('slava-ratings',JSON.stringify(ratings));ratingDialog.close();updateStats();render();});
$('.dialog-close').addEventListener('click',()=>ratingDialog.close());$('.details-close').addEventListener('click',()=>detailsDialog.close());
ratingDialog.addEventListener('click',e=>{if(e.target===ratingDialog)ratingDialog.close();});detailsDialog.addEventListener('click',e=>{if(e.target===detailsDialog)detailsDialog.close();});
search.addEventListener('input',render);sort.addEventListener('change',()=>{updateSortControls();render();});sortDirection.addEventListener('change',render);contentTypeSelect.addEventListener('change',render);genreSelect.addEventListener('change',render);directorSelect.addEventListener('change',render);
document.querySelectorAll('[data-hero-filter]').forEach(button=>button.addEventListener('click',()=>{activeFilter=button.dataset.heroFilter;document.querySelector('.filter.active')?.classList.remove('active');document.querySelector(`[data-filter="${activeFilter}"]`)?.classList.add('active');render();document.querySelector('#collection').scrollIntoView({behavior:'smooth'});}));
$('#reset').addEventListener('click',()=>{search.value='';sort.value='az';sortDirection.value='desc';contentTypeSelect.value='all';genreSelect.value='all';directorSelect.value='all';activeFilter='all';updateSortControls();render();});
refreshSelects();updateStats();updateSortControls();render();
window.addEventListener('community:ratings',event=>{communityRatings=event.detail.summaries||{};render();});
async function syncPersonalRatings(api,user){
  if(!user){updateStats();render();return;}
  const legacyRatings={...ratings};let cloudRatings=await api.myRatings();const migrationKey=`verbtw-ratings-migrated:${user.id}`;
  if(!Object.keys(cloudRatings).length&&Object.keys(legacyRatings).length&&!localStorage.getItem(migrationKey)){await api.saveRatings(legacyRatings);cloudRatings=legacyRatings;localStorage.setItem(migrationKey,'1');}
  Object.keys(ratings).forEach(title=>delete ratings[title]);Object.assign(ratings,cloudRatings);localStorage.setItem('slava-ratings',JSON.stringify(ratings));updateStats();render();
}
window.communityReady?.then(async api=>{if(!api.available)return;communityRatings=await api.loadSummaries();api.onAuth(user=>syncPersonalRatings(api,user).catch(()=>{}));await syncPersonalRatings(api,api.user);render();}).catch(()=>{});
