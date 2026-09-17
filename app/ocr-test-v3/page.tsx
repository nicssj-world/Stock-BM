'use client'

import { ChangeEvent, useMemo, useRef, useState } from 'react'

type Engine = 'RapidOCR / ONNX' | 'PaddleOCR.js Official' | 'Tesseract.js'
type Result = { engine: Engine; ok: boolean; totalMs: number; stages: string[]; text: string; confidence?: number }

declare global {
  interface Window { cv?: unknown; ort?: unknown; EsearchOCR?: unknown; Tesseract?: unknown }
}

const sleep = (ms:number) => new Promise(r => setTimeout(r, ms))
const fmt = (ms:number) => `${(ms/1000).toFixed(1)} s`

function loadScript(src:string, id:string, type?:string){
  return new Promise<void>((resolve,reject)=>{
    const old=document.getElementById(id) as HTMLScriptElement|null
    if(old?.dataset.loaded==='1') return resolve()
    const s=old||document.createElement('script'); s.id=id; s.src=src; if(type)s.type=type
    s.onload=()=>{s.dataset.loaded='1';resolve()}; s.onerror=()=>reject(new Error(`โหลด ${src} ไม่สำเร็จ`))
    if(!old)document.head.appendChild(s)
  })
}

async function canvasFromFile(file:File,maxSide=2500){
  const url=URL.createObjectURL(file)
  try{
    const img=new Image(); img.decoding='async'; img.src=url
    await new Promise<void>((resolve,reject)=>{img.onload=()=>resolve();img.onerror=()=>reject(new Error('Safari decode รูปไม่สำเร็จ'))})
    const scale=Math.min(1,maxSide/Math.max(img.naturalWidth,img.naturalHeight))
    const c=document.createElement('canvas'); c.width=Math.max(1,Math.round(img.naturalWidth*scale)); c.height=Math.max(1,Math.round(img.naturalHeight*scale))
    const ctx=c.getContext('2d',{alpha:false,willReadFrequently:true}); if(!ctx)throw new Error('Canvas 2D ไม่พร้อม')
    ctx.drawImage(img,0,0,c.width,c.height)
    const data=ctx.getImageData(0,0,c.width,c.height), p=data.data
    let lo=255,hi=0
    const hist=new Uint32Array(256)
    for(let i=0;i<p.length;i+=4){const y=Math.round(.299*p[i]+.587*p[i+1]+.114*p[i+2]);hist[y]++}
    const total=c.width*c.height, lowN=total*.01, highN=total*.99; let acc=0
    for(let i=0;i<256;i++){acc+=hist[i];if(acc>=lowN){lo=i;break}}
    acc=0; for(let i=0;i<256;i++){acc+=hist[i];if(acc>=highN){hi=i;break}}
    const span=Math.max(1,hi-lo)
    for(let i=0;i<p.length;i+=4){let y=.299*p[i]+.587*p[i+1]+.114*p[i+2];y=Math.max(0,Math.min(255,(y-lo)*255/span));p[i]=p[i+1]=p[i+2]=y}
    ctx.putImageData(data,0,0)
    return c
  } finally { URL.revokeObjectURL(url) }
}

function canvasBlob(c:HTMLCanvasElement){return new Promise<Blob>((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(new Error('สร้าง OCR image ไม่สำเร็จ')),'image/jpeg',.94))}

async function waitForCv(timeout=30000){
  const start=performance.now()
  while(performance.now()-start<timeout){
    let cv=window.cv as {Mat?:unknown; then?: (f:(v:unknown)=>unknown)=>unknown}|undefined
    if(cv){
      if(typeof cv.then==='function'){
        try{cv=await Promise.race([Promise.resolve(cv),new Promise<never>((_,rej)=>setTimeout(()=>rej(new Error('OpenCV init timeout')),12000))]) as typeof cv; window.cv=cv}catch{/* keep polling */}
      }
      if(cv && typeof cv.Mat==='function')return cv
    }
    await sleep(200)
  }
  throw new Error('OpenCV.js โหลดแล้วแต่ runtime ยังไม่ ready ภายใน 30 วินาที')
}

function fields(text:string){
  const lines=text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean)
  const hit=(re:RegExp)=>lines.filter(x=>re.test(x)).slice(0,10).join('\n')||'—'
  return {ref:hit(/\b(cat(?:alog)?|ref(?:erence)?|item\s*no|product\s*code)\b/i),lot:hit(/\b(lot|batch)\b/i),exp:hit(/\b(exp|expiry|expiration|use\s*by)\b/i),qty:hit(/\b(qty|quantity|จำนวน)\b/i)}
}

export default function OcrTestV3(){
  const [blob,setBlob]=useState<Blob|null>(null), [dataUrl,setDataUrl]=useState(''), [preview,setPreview]=useState(''), [meta,setMeta]=useState('ยังไม่ได้เลือกรูป')
  const [status,setStatus]=useState('พร้อม — เลือกรูป Invoice'), [busy,setBusy]=useState(false), [results,setResults]=useState<Result[]>([])
  const canvasRef=useRef<HTMLCanvasElement|null>(null)
  const canRun=!!blob&&!busy
  const ua=useMemo(()=>typeof navigator==='undefined'?'':navigator.userAgent,[])

  async function choose(e:ChangeEvent<HTMLInputElement>){
    const file=e.target.files?.[0]; if(!file)return
    setBusy(true);setStatus('กำลัง resize + Enhanced preprocessing ที่ 2500 px…')
    try{const c=await canvasFromFile(file);canvasRef.current=c;const b=await canvasBlob(c);setBlob(b);const d=c.toDataURL('image/jpeg',.94);setDataUrl(d);setPreview(d);setMeta(`${file.name||'camera'} • ${(file.size/1048576).toFixed(2)} MB → ${c.width}×${c.height}px • OCR ${(b.size/1048576).toFixed(2)} MB`);setResults([]);setStatus('ภาพพร้อม — เลือก engine หรือทดสอบทั้ง 3 ตัว')}
    catch(err){setStatus(`เตรียมภาพ ERROR: ${err instanceof Error?err.message:String(err)}`)}finally{setBusy(false);e.target.value=''}
  }

  async function rapid():Promise<Result>{
    const t=performance.now(), stages:string[]=[]
    try{
      let s=performance.now();setStatus('RapidOCR: โหลด ORT + OpenCV + module…')
      await Promise.all([loadScript('https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.2/dist/ort.min.js','ort-v3'),loadScript('https://docs.opencv.org/4.10.0/opencv.js','opencv-v3'),loadScript('/ocr-rapid-loader.js','rapid-loader-v3','module')]); stages.push(`scripts ${fmt(performance.now()-s)}`)
      s=performance.now();const cv=await waitForCv();stages.push(`OpenCV ready ${fmt(performance.now()-s)}`)
      const Paddle=window.EsearchOCR as {init:(o:unknown)=>Promise<unknown>;ocr:(x:string)=>Promise<unknown>}; if(!Paddle?.init)throw new Error('EsearchOCR module ไม่พร้อม')
      s=performance.now();const assets='https://cdn.jsdelivr.net/npm/paddleocr-browser/dist/', dic=await(await fetch(assets+'ppocr_keys_v1.txt')).text(); await Paddle.init({detPath:assets+'ppocr_det.onnx',recPath:assets+'ppocr_rec.onnx',dic,ort:window.ort,node:false,cv});stages.push(`models ${fmt(performance.now()-s)}`)
      s=performance.now();const raw=await Paddle.ocr(dataUrl) as unknown;stages.push(`inference ${fmt(performance.now()-s)}`)
      const rows=Array.isArray(raw)?raw:((raw as {result?:unknown[];data?:unknown[]})?.result||(raw as {data?:unknown[]})?.data||[])
      const text=Array.isArray(rows)?rows.map((x:unknown)=>{const a=x as {text?:string}|unknown[];return !Array.isArray(a)?a?.text:(Array.isArray(a?.[1])?a[1][0]:a?.[1])}).filter(Boolean).join('\n'):JSON.stringify(raw,null,2)
      return {engine:'RapidOCR / ONNX',ok:true,totalMs:performance.now()-t,stages,text}
    }catch(err){return {engine:'RapidOCR / ONNX',ok:false,totalMs:performance.now()-t,stages,text:err instanceof Error?(err.stack||err.message):String(err)}}
  }

  async function paddle():Promise<Result>{
    const t=performance.now(), stages:string[]=[]
    try{
      let s=performance.now();setStatus('PaddleOCR: import official npm SDK…');const {PaddleOCR}=await import('@paddleocr/paddleocr-js');stages.push(`SDK import ${fmt(performance.now()-s)}`)
      s=performance.now();setStatus('PaddleOCR: โหลด PP-OCRv5 models…');const ocr=await PaddleOCR.create({lang:'en',ocrVersion:'PP-OCRv5',worker:false,ortOptions:{backend:'wasm',wasmPaths:'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/',numThreads:1,simd:true}});stages.push(`model init ${fmt(performance.now()-s)}`)
      s=performance.now();const [r]=await ocr.predict(blob!,{textDetLimitSideLen:2500,textRecScoreThresh:.2});stages.push(`inference ${fmt(performance.now()-s)}`)
      const text=(r?.items||[]).map(x=>x.text).filter(Boolean).join('\n'), scores=(r?.items||[]).map(x=>x.score).filter(Number.isFinite), confidence=scores.length?scores.reduce((a,b)=>a+b,0)/scores.length*100:undefined
      stages.push(`boxes ${r?.metrics?.detectedBoxes??r?.items?.length??0} • recognized ${r?.metrics?.recognizedCount??r?.items?.length??0}`);ocr.dispose()
      return {engine:'PaddleOCR.js Official',ok:true,totalMs:performance.now()-t,stages,text,confidence}
    }catch(err){return {engine:'PaddleOCR.js Official',ok:false,totalMs:performance.now()-t,stages,text:err instanceof Error?(err.stack||err.message):String(err)}}
  }

  async function tess():Promise<Result>{
    const t=performance.now(),stages:string[]=[]
    try{
      let s=performance.now();setStatus('Tesseract: โหลด browser SDK…');await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js','tess-v3');stages.push(`SDK ${fmt(performance.now()-s)}`)
      const T=window.Tesseract as {createWorker:(lang:string,oem:number,opt:unknown)=>Promise<{recognize:(b:Blob)=>Promise<{data:{text:string;confidence:number}}>;terminate:()=>Promise<void>}>};if(!T?.createWorker)throw new Error('Tesseract SDK ไม่พร้อม')
      s=performance.now();const worker=await T.createWorker('eng',1,{logger:(m:{status?:string;progress?:number})=>m.status&&setStatus(`Tesseract: ${m.status} ${m.progress!=null?Math.round(m.progress*100)+'%':''}`)});stages.push(`worker/model ${fmt(performance.now()-s)}`)
      s=performance.now();const {data}=await worker.recognize(blob!);stages.push(`inference ${fmt(performance.now()-s)}`);await worker.terminate();return {engine:'Tesseract.js',ok:true,totalMs:performance.now()-t,stages,text:data.text,confidence:data.confidence}
    }catch(err){return {engine:'Tesseract.js',ok:false,totalMs:performance.now()-t,stages,text:err instanceof Error?(err.stack||err.message):String(err)}}
  }

  async function run(fn:()=>Promise<Result>){setBusy(true);try{const r=await fn();setResults(v=>[r,...v]);setStatus(`${r.engine}: ${r.ok?'สำเร็จ':'ERROR'} • ${fmt(r.totalMs)}`)}finally{setBusy(false)}}
  async function all(){setBusy(true);setResults([]);try{for(const fn of [rapid,paddle,tess]){const r=await fn();setResults(v=>[r,...v])}setStatus('ทดสอบครบทั้ง 3 engine แล้ว')}finally{setBusy(false)}}

  return <main style={{maxWidth:780,margin:'0 auto',padding:'18px 14px 50px',fontFamily:'-apple-system,BlinkMacSystemFont,"Noto Sans Thai",sans-serif',color:'#111'}}>
    <h1 style={{fontSize:24,marginBottom:4}}>OCR Browser Spike v3 — iPhone</h1><p style={{color:'#666',fontSize:13,marginTop:0}}>Throwaway feasibility test • 2500px Enhanced • แยก SDK / model / inference timing</p>
    <section style={card}><div style={{display:'grid',gap:10}}><label style={pick}>🖼 เลือกจาก Photos<input style={{display:'block',width:'100%',marginTop:10}} type="file" accept="image/*" onChange={choose}/></label><label style={pick}>📷 ถ่ายรูป Invoice<input style={{display:'block',width:'100%',marginTop:10}} type="file" accept="image/*" capture="environment" onChange={choose}/></label></div>{preview&&<img src={preview} alt="OCR input" style={{width:'100%',maxHeight:'48vh',objectFit:'contain',marginTop:12,borderRadius:10}}/>}<p style={small}>{meta}</p><p style={small}>{ua}</p></section>
    <section style={card}><div style={{display:'grid',gap:9}}><button style={btn} disabled={!canRun} onClick={()=>run(rapid)}>1 · RapidOCR / ONNX</button><button style={btn} disabled={!canRun} onClick={()=>run(paddle)}>2 · PaddleOCR.js Official</button><button style={btn} disabled={!canRun} onClick={()=>run(tess)}>3 · Tesseract.js</button><button style={{...btn,background:'#e9e9ed',color:'#111'}} disabled={!canRun} onClick={all}>ทดสอบทั้ง 3 ตัวตามลำดับ</button></div><div style={{marginTop:10,padding:10,borderRadius:9,background:'#f1f3f5',fontSize:13}}>{status}</div></section>
    {results.map((r,i)=>{const f=fields(r.text);return <section key={`${r.engine}-${i}`} style={card}><div style={{display:'flex',justifyContent:'space-between',gap:8}}><strong>{r.engine} — {r.ok?'OK':'ERROR'}</strong><span>{fmt(r.totalMs)}</span></div><p style={small}>{r.stages.join(' • ')}{r.confidence!=null?` • confidence ${r.confidence.toFixed(1)}%`:''}</p><div style={{display:'grid',gridTemplateColumns:'105px 1fr',gap:'6px 8px',fontSize:13}}><b>Catalog/REF</b><span style={{whiteSpace:'pre-wrap'}}>{f.ref}</span><b>LOT/Batch</b><span style={{whiteSpace:'pre-wrap'}}>{f.lot}</span><b>Expiry</b><span style={{whiteSpace:'pre-wrap'}}>{f.exp}</span><b>Qty</b><span style={{whiteSpace:'pre-wrap'}}>{f.qty}</span></div><pre style={{whiteSpace:'pre-wrap',wordBreak:'break-word',fontSize:12,lineHeight:1.45,maxHeight:'42vh',overflow:'auto',background:'#111',color:'#eee',padding:12,borderRadius:10}}>{r.text||'(ไม่พบข้อความ)'}</pre></section>})}
  </main>
}

const card:React.CSSProperties={background:'#fff',border:'1px solid #ddd',borderRadius:14,padding:14,margin:'12px 0',boxShadow:'0 1px 4px #0000000a'}
const pick:React.CSSProperties={display:'block',border:'2px dashed #aaa',borderRadius:12,padding:16,textAlign:'center',fontWeight:700}
const btn:React.CSSProperties={minHeight:48,border:0,borderRadius:11,fontSize:16,fontWeight:700,padding:'10px 12px',background:'#111',color:'#fff'}
const small:React.CSSProperties={fontSize:12,color:'#666',wordBreak:'break-word'}
