
const setup=document.getElementById('setup');
const workspace=document.getElementById('workspace');
const grid=document.getElementById('grid');
const status=document.createElement('div');
status.style.cssText='position:fixed;left:12px;bottom:12px;z-index:99999;background:#171b21;color:#cbd2dc;border:1px solid #343b45;border-radius:8px;padding:8px 10px;font:12px Arial;display:none;max-width:70vw;';
document.body.appendChild(status);
function showStatus(msg, error=false){ status.textContent=msg; status.style.display='block'; status.style.borderColor=error?'#9b3b3b':'#343b45'; if(!error)setTimeout(()=>status.style.display='none',3000); }

let count=0,mode='auto',panels=new Map();
function api(){
  if(!window.multiview){
    showStatus('Error: la comunicación con MultiView no está disponible. Revisá la consola.',true);
    throw new Error('window.multiview no está disponible');
  }
  return window.multiview;
}
function cols(n){if(mode!=='auto')return +mode;if(n<=1)return 1;if(n<=4)return 2;if(n<=9)return 3;if(n<=16)return 4;if(n<=25)return 5;return 6}
function norm(v){v=String(v||'').trim();if(!v)return '';if(v.toLowerCase().startsWith('http://') || v.toLowerCase().startsWith('https://'))return v;return 'https://'+v}
function setGrid(){const c=cols(count);grid.style.gridTemplateColumns=`repeat(${c},minmax(0,1fr))`;grid.style.gridTemplateRows=`repeat(${Math.ceil(count/c)},minmax(0,1fr))`}
async function sync(){
  setGrid();
  const out=[];
  for(const [id,p] of panels){
    const r=p.el.getBoundingClientRect();
    out.push({id,rect:{x:r.left,y:r.top,width:r.width,height:r.height}});
  }
  try { await api().updateRects(out); } catch(e) { showStatus(`Error al ajustar paneles: ${e.message}`,true); }
}
async function addPanel(){
  count++;
  const number=count;
  const id='p'+number;
  const el=document.createElement('div');
  el.className='panel';
  el.innerHTML=`<div class="panel-head"><span class="num">Panel ${number}</span><button class="small url">URL</button><button class="small reload">↻</button><button class="small clear">×</button></div><div class="panel-host"><div class="note"><div><strong>Cargá una URL</strong>El sitio se mostrará dentro de este rectángulo.</div></div></div><div class="urlbox"><input placeholder="https://ejemplo.com"><button>Cargar</button></div>`;
  grid.appendChild(el);
  const input=el.querySelector('.urlbox input');
  const p={el,id,url:''};panels.set(id,p);

  async function load(v){
    v=norm(v); if(!v)return;
    p.url=v;
    el.querySelector('.note')?.remove();
    const r=el.getBoundingClientRect();
    try {
      const result=await api().createView({id,url:v,rect:{x:r.left,y:r.top,width:r.width,height:r.height}});
      if(!result?.ok) showStatus(`No se pudo crear Panel ${number}: ${result?.error||'error desconocido'}`,true);
    } catch(e) { showStatus(`No se pudo crear Panel ${number}: ${e.message}`,true); }
  }
  el.querySelector('.url').onclick=()=>{el.classList.toggle('show');if(el.classList.contains('show'))input.focus()};
  el.querySelector('.urlbox button').onclick=()=>{load(input.value);el.classList.remove('show')};
  input.onkeydown=e=>{if(e.key==='Enter'){load(input.value);el.classList.remove('show')}};
  el.querySelector('.reload').onclick=()=>api().reload({id});
  el.querySelector('.clear').onclick=async()=>{
    await api().removeView({id});p.url='';
    el.querySelector('.panel-host').innerHTML='<div class="note"><div><strong>Cargá una URL</strong>El sitio se mostrará dentro de este rectángulo.</div></div>';
  };
  el.addEventListener('dragover',e=>e.preventDefault());
  el.addEventListener('drop',e=>{e.preventDefault();const u=e.dataTransfer.getData('text/uri-list')||e.dataTransfer.getData('text/plain')||e.dataTransfer.getData('text');if(u)load(u.split('\n')[0])});
  setGrid();
}

document.getElementById('create').onclick=async()=>{
  try{
    const raw=Number(document.getElementById('count').value);
    count=Math.max(1,Math.min(30,Number.isFinite(raw)?raw:4));
    mode=document.getElementById('cols').value;
    if(!window.multiview) throw new Error('La API de MultiView no está disponible.');
    const ping=await window.multiview.ping();
    if(!ping?.ok) throw new Error('Electron no respondió al ping.');
    setup.style.display='none';
    workspace.style.display='flex';
    for(let i=0;i<count;i++) await addPanel();
    await sync();
  }catch(e){
    console.error(e);
    showStatus(`No se pudo crear el MultiView: ${e.message}`,true);
  }
};
document.getElementById('add').onclick=async()=>{if(count<30){await addPanel();await sync()}};
document.getElementById('reset').onclick=()=>location.reload();
window.addEventListener('resize',()=>sync());
if(window.multiview){
  window.multiview.on('mv-error',d=>showStatus(`Panel: ${d.errorDescription||'error de carga'}`,true));
  window.multiview.on('mv-ui-error',d=>showStatus(d.message||'Error de Electron',true));
}
