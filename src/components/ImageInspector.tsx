import { useRef, useState } from 'react';
import type { Batch } from '../lib/data';
import { analyzeImage, loadImage, makeSampleImage, type VisionResult } from '../lib/vision';
import { ScoreRing } from './Charts';

interface Props {
  batches: Batch[];
  onAttach: (batchId: string, score: number) => void;
}

type Pred = { className: string; probability: number };

export function ImageInspector({ batches, onAttach }: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<VisionResult | null>(null);
  const [overlay, setOverlay] = useState(true);
  const [target, setTarget] = useState(batches[0]?.id ?? '');
  const [attached, setAttached] = useState<string | null>(null);
  const [preds, setPreds] = useState<Pred[] | null>(null);
  const [clsState, setClsState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [clsErr, setClsErr] = useState('');
  const imgRef = useRef<HTMLImageElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = (url: string, n: string) => {
    setSrc(url); setName(n); setRes(null); setErr(null); setAttached(null); setPreds(null); setClsState('idle');
  };

  const onFile = (f?: File | null) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) { setErr('That file is not an image. Upload a JPG, PNG or WebP.'); return; }
    if (f.size > 15 * 1024 * 1024) { setErr('Image is larger than 15 MB — please use a smaller photo.'); return; }
    const reader = new FileReader();
    reader.onload = () => reset(String(reader.result), f.name);
    reader.onerror = () => setErr('Could not read the file.');
    reader.readAsDataURL(f);
  };

  const run = async () => {
    if (!src) return;
    setBusy(true); setErr(null);
    try {
      await new Promise(r => setTimeout(r, 30)); // let the spinner paint
      const img = await loadImage(src);
      setRes(await analyzeImage(img));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Analysis failed.');
    } finally { setBusy(false); }
  };

  const classify = async () => {
    if (!imgRef.current) return;
    setClsState('loading'); setClsErr('');
    try {
      const [tf, mobilenet] = await Promise.all([import('@tensorflow/tfjs'), import('@tensorflow-models/mobilenet')]);
      await tf.ready();
      const model = await mobilenet.load({ version: 2, alpha: 0.5 });
      setPreds(await model.classify(imgRef.current, 3));
      setClsState('idle');
    } catch (e) {
      setClsState('error');
      setClsErr('Could not load MobileNet weights (needs an internet connection the first time). Colour/texture analysis still works offline.');
      console.error(e);
    }
  };

  return (
    <div className="inspector">
      <div className="insp-left">
        <div
          className={`drop ${src ? 'has' : ''}`}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); onFile(e.dataTransfer.files?.[0]); }}
        >
          {src ? (
            <div className="preview">
              <img ref={imgRef} src={src} alt="Uploaded produce" crossOrigin="anonymous" />
              {res && overlay && <img className="overlay" src={res.overlayUrl} alt="" />}
              {res && overlay && res.boxes.map((b, i) => (
                <div key={i} className={`box ${b.kind}`} style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` }}>
                  {res.boxes.findIndex(x => x.kind === b.kind) === i && <span>{b.kind}</span>}
                </div>
              ))}
              {busy && <div className="scan"><div className="spinner" /> Analysing pixels…</div>}
            </div>
          ) : (
            <div className="drop-empty">
              <div className="drop-icon">⌖</div>
              <strong>Drop a produce photo here</strong>
              <span>or use a generated sample below. Processing stays in your browser.</span>
            </div>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
        <div className="btn-row">
          <button className="btn" onClick={() => fileRef.current?.click()}>Upload image</button>
          <button className="btn ghost" onClick={() => reset(makeSampleImage('fresh'), 'sample-fresh.png')}>Sample: fresh</button>
          <button className="btn ghost" onClick={() => reset(makeSampleImage('bruised'), 'sample-bruised.png')}>Sample: bruised</button>
          <button className="btn ghost" onClick={() => reset(makeSampleImage('mouldy'), 'sample-mould.png')}>Sample: pale patch</button>
        </div>
        {src && (
          <div className="btn-row">
            <button className="btn primary" disabled={busy} onClick={run}>{busy ? 'Analysing…' : res ? 'Re-run analysis' : 'Run visual analysis'}</button>
            {res && <label className="chk"><input type="checkbox" checked={overlay} onChange={e => setOverlay(e.target.checked)} /> Show annotations</label>}
            <span className="muted small">{name}</span>
          </div>
        )}
        {err && <div className="alert">{err}</div>}
        {res && (
          <div className="legend small">
            <span><i style={{ background: '#dc2626' }} /> dark lesion</span>
            <span><i style={{ background: '#ea8c14' }} /> brown discoloration</span>
            <span><i style={{ background: '#60a5fa' }} /> pale patch</span>
          </div>
        )}
      </div>

      <div className="insp-right">
        {!res ? (
          <div className="empty tall">
            <strong>No analysis yet</strong>
            <p>Upload or generate an image, then run the analysis. You'll get colour-distribution, discoloration and texture indicators with an annotated overlay.</p>
          </div>
        ) : (
          <>
            <div className="insp-head">
              <ScoreRing value={res.visualScore} label="Visual heuristic" />
              <div>
                <div className="eyebrow">Visual score · heuristic, not a trained detector</div>
                <p className="small">Weighted sum of the indicators below. Computed in {res.ms} ms on a {res.width}×{res.height} downsample. Produce area: {res.foregroundPct}%{res.segmentationFallback ? ' (background not separable — whole frame used)' : ' (border-colour segmentation)'}.</p>
              </div>
            </div>
            <table className="ind">
              <tbody>
                {res.indicators.map(i => (
                  <tr key={i.key} title={i.note}>
                    <td><strong>{i.label}</strong><div className="muted small">{i.display}</div></td>
                    <td className="ind-bar"><div style={{ width: `${i.contribution}%` }} /></td>
                    <td className="mono right">{Math.round(i.contribution)}<small> ×{i.weight}</small></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="hue">
              <div className="eyebrow">Hue distribution (saturated pixels)</div>
              <div className="hue-bars">
                {res.hueHistogram.map((v, i) => (
                  <div key={i} style={{ height: `${Math.max(3, v * 100)}%`, background: `hsl(${i * 30 + 15} 65% 50%)` }} title={`${i * 30}–${i * 30 + 29}°: ${(v * 100).toFixed(0)}%`} />
                ))}
              </div>
            </div>
            <div className="attach">
              <select value={target} onChange={e => setTarget(e.target.value)}>
                {batches.map(b => <option key={b.id} value={b.id}>{b.id} · {b.food}</option>)}
              </select>
              <button className="btn primary" onClick={() => { onAttach(target, res.visualScore); setAttached(target); }}>Attach to batch</button>
            </div>
            {attached && <div className="ok small">Visual score attached to {attached}. The inventory risk now includes it as a separate factor.</div>}

            <div className="cls">
              <div className="eyebrow">Optional · pretrained object classifier</div>
              <p className="small muted">MobileNet v2 (ImageNet) runs locally via TensorFlow.js. It names the produce type only — it says nothing about freshness.</p>
              {preds ? (
                <ul className="preds">{preds.map(p => <li key={p.className}><span>{p.className.split(',')[0]}</span><span className="mono">{(p.probability * 100).toFixed(1)}%</span></li>)}</ul>
              ) : (
                <button className="btn ghost" disabled={clsState === 'loading'} onClick={classify}>{clsState === 'loading' ? 'Loading model…' : 'Identify produce (MobileNet)'}</button>
              )}
              {clsState === 'error' && <div className="alert small">{clsErr}</div>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
