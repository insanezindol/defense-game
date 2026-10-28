import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  build, DIFFICULTIES, DEFAULT_DIFFICULTY, heroUpgradeCost, newGame, repair, restore,
  SAVE_KEY, serialize, startWave, TOWERS, towerUpgradeCost, update, upgradeHero,
  upgradeTower, useSkill, BRANCHES, TACTICS, tacticsOffered, chooseTactic,
  specializeTower, sellTower, towerSellValue, towerStats, wavePlan, waveReward,
  type GameState, type Difficulty, type TowerKind, type TowerBranch,
} from './game';
import { World } from './world';
import { PADS } from './battlefield';
import './style.css';

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    shield: <><path d="M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6z" /><path d="M8 12l3 3 5-6" /></>,
    target: <><circle cx="12" cy="12" r="7" /><path d="M12 2v6m0 8v6M2 12h6m8 0h6" /></>,
    coin: <><path d="M4 6l8-4 8 4v12l-8 4-8-4zM8 9h8m-8 6h8M12 7v10" /></>,
    play: <path d="M8 4l12 8-12 8z" />,
    pause: <path d="M8 5v14M16 5v14" />,
    close: <path d="M6 6l12 12M18 6L6 18" />,
    reset: <path d="M4 10a8 8 0 111 8M4 4v6h6" />,
    menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
    sound: <><path d="M4 10h4l5-5v14l-5-5H4zM17 8c4 3 4 5 0 8" /></>,
    mute: <><path d="M4 10h4l5-5v14l-5-5H4zM17 9l5 6m0-6l-5 6" /></>,
    bolt: <path d="M13 2L4 14h7l-1 8 10-13h-7z" />,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.target}</svg>;
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose?: () => void }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('button:not([disabled]),input');
    (first || ref.current)?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  return <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose?.(); }}>
    <section ref={ref} className="modal" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}
      onKeyDown={e => {
        if (e.key === 'Escape') { e.stopPropagation(); onClose?.(); }
        if (e.key !== 'Tab') return;
        const items = [...(ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),[tabindex="0"]') || [])];
        const first = items[0], last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }}>
      <div className="modal-heading"><span className="eyebrow">FRONTLINE / OPERATIONS</span>{onClose && <button className="icon-button" aria-label="닫기" onClick={onClose}><Icon name="close" /></button>}</div>
      <h1>{title}</h1>{children}
    </section>
  </div>;
}

function readSave() {
  try { return localStorage.getItem(SAVE_KEY); } catch { return null; }
}

function App() {
  const [initial] = useState(() => restore(readSave()));
  const state = useRef<GameState>(initial || newGame());
  const [view, setView] = useState({ ...state.current });
  const host = useRef<HTMLDivElement>(null), world = useRef<World | null>(null);
  const buildSheet = useRef<HTMLElement>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const selectedRef = useRef<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false), [intelOpen, setIntelOpen] = useState(false);
  const menuOpenRef = useRef(false);
  const [paused, setPaused] = useState(false), pausedRef = useRef(false);
  const [help, setHelp] = useState(!initial), [newOperation, setNewOperation] = useState(!initial);
  const newOperationRef = useRef(!initial);
  const [difficulty, setDifficulty] = useState<Difficulty>(initial?.difficulty ?? DEFAULT_DIFFICULTY);
  const [confirmReset, setConfirmReset] = useState(false);
  const [sound, setSound] = useState(false), soundRef = useRef(false);
  const [speed, setSpeed] = useState(1), speedRef = useRef(1);
  const [toast, setToast] = useState(''), toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [income, setIncome] = useState(0), incomeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [renderError, setRenderError] = useState(''), [saveError, setSaveError] = useState(false);
  const keys = useRef(new Set<string>()), joystick = useRef({ x: 0, z: 0 }), stick = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const audio = useRef<AudioContext | null>(null);
  useEffect(() => { if (selected !== null) buildSheet.current?.focus(); }, [selected]);
  selectedRef.current = selected;
  menuOpenRef.current = menuOpen;
  pausedRef.current = paused || help || confirmReset || view.pendingTactic;
  soundRef.current = sound; speedRef.current = speed;
  function notify(message: string) {
    setToast(message); clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2200);
  }
  function showIncome(gain: number) {
    if (gain <= 0) return;
    setIncome(v => v + gain); clearTimeout(incomeTimer.current);
    incomeTimer.current = setTimeout(() => setIncome(0), 900);
  }
  function tone(frequency = 520) {
    if (!soundRef.current) return;
    try {
      audio.current ??= new AudioContext(); void audio.current.resume();
      const oscillator = audio.current.createOscillator(), gain = audio.current.createGain();
      oscillator.type = 'triangle'; oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.025, audio.current.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.current.currentTime + 0.1);
      oscillator.connect(gain).connect(audio.current.destination); oscillator.start(); oscillator.stop(audio.current.currentTime + 0.1);
    } catch { /* Optional audio must not interrupt play. */ }
  }
  function save() {
    if (newOperationRef.current) return;
    try { localStorage.setItem(SAVE_KEY, serialize(state.current)); setSaveError(false); }
    catch { setSaveError(true); }
  }
  function act(action: () => boolean, message: string) {
    if (!action()) { notify('자원이 부족하거나 현재 실행할 수 없습니다.'); return; }
    setView({ ...state.current }); save(); tone(); notify(message);
  }
  function wave() {
    if (pausedRef.current) return;
    act(() => startWave(state.current), `웨이브 ${state.current.wave + 1} — 교전 개시`);
    setSelected(null); setMenuOpen(false); setIntelOpen(false);
  }
  function skill() {
    if (pausedRef.current) return;
    const before = state.current.gold;
    if (useSkill(state.current)) { showIncome(state.current.gold - before); tone(180); setView({ ...state.current }); notify('지원 포격 요청'); }
  }
  function reset() {
    state.current = newGame(difficulty); newOperationRef.current = false;
    setView({ ...state.current }); setSelected(null); setMenuOpen(false); setIntelOpen(false);
    setPaused(false); setConfirmReset(false); setNewOperation(false); setHelp(false);
    clearTimeout(incomeTimer.current); setIncome(0);
    world.current?.resetView(); save(); notify('방어선을 구축하십시오.');
  }
  useEffect(() => {
    if (!host.current) return;
    let w: World;
    try {
      w = new World(host.current, pad => { setSelected(pad); setMenuOpen(false); }); world.current = w;
    } catch { setRenderError('3D 렌더링을 시작하지 못했습니다. 하드웨어 가속을 켜고 새로고침해 주세요.'); return; }
    let last = performance.now(), ui = 0, autosave = 0, previousKills = state.current.kills, previousPhase = state.current.phase;
    w.renderer.setAnimationLoop((now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05); last = now;
      if (!pausedRef.current && !menuOpenRef.current && selectedRef.current === null && !document.hidden) {
        const x = Number(keys.current.has('d') || keys.current.has('arrowright')) - Number(keys.current.has('a') || keys.current.has('arrowleft')) + joystick.current.x;
        const z = Number(keys.current.has('s') || keys.current.has('arrowdown')) - Number(keys.current.has('w') || keys.current.has('arrowup')) + joystick.current.z;
        const movement = w.screenInput(x, z), beforeGold = state.current.gold;
        for (let i = 0; i < speedRef.current; i++) update(state.current, dt, movement);
        if (state.current.kills > previousKills) {
          const gain = Math.max(0, state.current.gold - beforeGold);
          showIncome(gain);
          tone(640);
        }
        previousKills = state.current.kills;
        if (previousPhase === 'battle' && (state.current.phase === 'ready' || state.current.phase === 'won')) {
          notify(`웨이브 ${state.current.wave} 방어 성공 · +${waveReward(state.current.wave)} 자원`); save();
        }
        previousPhase = state.current.phase;
        ui += dt; autosave += dt;
        if (ui >= 0.1 || state.current.pendingTactic) { setView({ ...state.current }); ui = 0; }
        if (autosave >= 2) { save(); autosave = 0; }
      }
      w.draw(state.current, selectedRef.current);
    });
    const down = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      const key = e.key.toLowerCase();
      if (key === ' ' && e.target instanceof Element && e.target.closest('button')) return;
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) e.preventDefault();
      keys.current.add(key); if (e.repeat) return;
      if (key === 'escape') { setSelected(null); setMenuOpen(false); setIntelOpen(false); }
      if (key === 'p') setPaused(v => !v);
      if (!pausedRef.current) { if (key === 'q') skill(); if (key === ' ') wave(); }
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    const blur = () => { keys.current.clear(); joystick.current = { x: 0, z: 0 }; setKnob({ x: 0, y: 0 }); save(); };
    const hidden = () => { if (document.hidden) { setPaused(true); blur(); } };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur);
    window.addEventListener('pagehide', save); document.addEventListener('visibilitychange', hidden);
    return () => {
      w.dispose(); world.current = null;
      window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur);
      window.removeEventListener('pagehide', save); document.removeEventListener('visibilitychange', hidden);
      clearTimeout(toastTimer.current); clearTimeout(incomeTimer.current);
    };
  }, []);
  function moveStick(e: React.PointerEvent) {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const rect = stick.current!.getBoundingClientRect(), dx = e.clientX - rect.left - rect.width / 2, dy = e.clientY - rect.top - rect.height / 2;
    const scale = Math.min(1, 32 / Math.max(1, Math.hypot(dx, dy)));
    setKnob({ x: dx * scale, y: dy * scale }); joystick.current = { x: dx * scale / 32, z: dy * scale / 32 };
  }
  function stopStick() { joystick.current = { x: 0, z: 0 }; setKnob({ x: 0, y: 0 }); }
  const ended = view.phase === 'won' || view.phase === 'lost';
  const canAct = !ended && !paused && !help && !confirmReset && !view.pendingTactic;
  const tower = selected === null ? undefined : view.towers.find(t => t.pad === selected);
  const stats = tower ? towerStats(view, tower) : undefined;
  const next = wavePlan(Math.min(20, view.wave + 1));
  const remaining = view.total - view.spawned + view.enemies.length;
  const completion = Math.max(0, Math.min(100, (view.spawned - view.enemies.length) / Math.max(1, view.total) * 100));
  const offers = view.pendingTactic ? tacticsOffered(view) : [];
  return <main className="app">
    <div className="canvas-host" ref={host} aria-label="3D 전초기지 전장" />
    <header className="hud">
      <span className="wordmark" aria-label="경계선: 최후의 전초기지">경계선<span>FRONTLINE</span></span>
      <div className="hud-value" aria-label={`기지 내구도 ${Math.ceil(view.hp)}`}><Icon name="shield" /><span><small>기지</small><b>{Math.ceil(view.hp)}<em> / {view.maxHp}</em></b></span></div>
      <div className="hud-value resource" aria-label={`보유 자원 ${view.gold}`}><Icon name="coin" /><span><small>자원</small><b>{view.gold.toLocaleString()}</b></span>{income > 0 && <i className="income" aria-hidden="true">+{income}</i>}</div>
      <div className="hud-value wave-counter"><span><small>WAVE</small><b>{String(view.wave || 1).padStart(2, '0')}<em> / 20</em></b></span></div>
      {view.phase === 'ready' && !view.pendingTactic && <div className="intel">
        <button aria-expanded={intelOpen} onClick={() => setIntelOpen(v => !v)}><span>다음 교전</span> {next.name} <b>{next.count}기</b><span aria-hidden="true">{intelOpen ? '−' : '+'}</span></button>
        {intelOpen && <p>{next.description}</p>}
      </div>}
      {view.phase === 'battle' && <div className="battle-status"><span>적 잔여 <b>{remaining}</b></span><i><b style={{ width: `${completion}%` }} /></i></div>}
    </header>
    {renderError && <div className="render-error" role="alert">{renderError}</div>}
    <div className="joystick" ref={stick} role="group" aria-label="지휘관 이동 조이스틱"
      onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); moveStick(e); }} onPointerMove={moveStick}
      onPointerUp={stopStick} onPointerCancel={stopStick} onLostPointerCapture={stopStick}>
      <span aria-hidden="true">+</span><i style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
    {menuOpen && <section className="command-panel" aria-label="지휘 패널">
      <div className="panel-heading"><div><span className="eyebrow">COMMAND · 계획 중 전투 정지</span><h2>지휘 패널</h2></div><button className="icon-button" aria-label="지휘 패널 닫기" onClick={() => setMenuOpen(false)}><Icon name="close" /></button></div>
      <div className="commander-row"><div><b>지휘관 Lv.{view.heroLevel}</b><small>기본 공격 {18 + (view.heroLevel - 1) * 11} · 자동 사격</small></div><button disabled={!canAct || view.heroLevel >= 10 || view.gold < heroUpgradeCost(view)} onClick={() => act(() => upgradeHero(state.current), '지휘관 강화 완료')}>{view.heroLevel >= 10 ? '최대 강화' : `강화 ${heroUpgradeCost(view)}`}</button></div>
      <div className="commander-row"><div><b>기지 수리</b><small>내구도 35 회복</small></div><button disabled={!canAct || view.hp >= view.maxHp || view.gold < 60} onClick={() => act(() => repair(state.current), '기지 수리 완료')}>수리 60</button></div>
      <label className="pad-picker">부지 바로 선택<select value="" onChange={e => { setSelected(Number(e.target.value)); setMenuOpen(false); }}><option value="" disabled>부지를 선택하세요</option>{PADS.map((_, pad) => {
        const placed = view.towers.find(t => t.pad === pad);
        return <option key={pad} value={pad}>{pad + 1}번 · {placed ? `${TOWERS[placed.kind].name} Lv.${placed.level}` : '빈 부지'}</option>;
      })}</select></label>
      <div className="menu-grid">
        <button onClick={() => { setPaused(v => !v); setMenuOpen(false); }}><Icon name={paused ? 'play' : 'pause'} />{paused ? '전투 재개' : '일시정지'}</button>
        <button onClick={() => { setSound(v => !v); soundRef.current = !sound; tone(); }}><Icon name={sound ? 'sound' : 'mute'} />{sound ? '소리 끄기' : '소리 켜기'}</button>
        <button onClick={() => world.current?.resetView()}><Icon name="reset" />시점 초기화</button>
        <button onClick={() => setHelp(true)}>조작 안내</button>
        <button onClick={() => setConfirmReset(true)}>새 작전</button>
      </div>
      {view.tactics.length > 0 && <div className="tactic-list"><small>적용 전술</small>{[...new Set(view.tactics)].map(id => <span key={id}>{TACTICS[id].name} ×{view.tactics.filter(t => t === id).length}</span>)}</div>}
      <small className="save-note" role={saveError ? 'alert' : undefined}>{saveError ? '저장 실패 — 브라우저 저장 공간을 확인하세요.' : '진행 자동 저장 · 이동 WASD / 방향키 · 지원 Q · 시작 SPACE · 정지 P'}</small>
    </section>}
    {selected !== null && <section ref={buildSheet} tabIndex={-1} className="build-sheet" role="dialog" aria-label={tower ? '포탑 강화' : '포탑 건설'}>
      <div className="panel-heading"><div><span className="eyebrow">EMPLACEMENT {String(selected + 1).padStart(2, '0')} · 계획 중 전투 정지</span><h2>{tower ? `${TOWERS[tower.kind].name} · Lv.${tower.level}` : '포탑 건설'}</h2></div><button className="icon-button" aria-label="건설 패널 닫기" onClick={() => setSelected(null)}><Icon name="close" /></button></div>
      {!tower ? <div className="build-options">{(Object.keys(TOWERS) as TowerKind[]).map(kind => <button key={kind} className={`build-option ${kind}`} disabled={!canAct || view.gold < TOWERS[kind].cost}
        onClick={() => act(() => build(state.current, selected, kind), `${TOWERS[kind].name} 배치 완료`)}>
        <span className="tower-glyph" aria-hidden="true">{TOWERS[kind].icon}</span><b>{TOWERS[kind].name}</b><small>{TOWERS[kind].subtitle}</small><strong>{TOWERS[kind].cost}<em> 자원</em></strong>
      </button>)}</div> : <>
        <div className="tower-stats"><span>공격력 <b>{Math.round(stats!.damage)}</b></span><span>사거리 <b>{stats!.range.toFixed(1)}</b></span><span>공격 간격 <b>{stats!.rate.toFixed(2)}s</b></span></div>
        {tower.level >= 3 && !tower.branch && <div className="specialization"><p>전문화 선택 <small>무료 · 선택 후 변경 불가</small></p><div>{(['primary', 'secondary'] as TowerBranch[]).map(branch => <button key={branch} disabled={!canAct} onClick={() => act(() => specializeTower(state.current, selected, branch), `${BRANCHES[tower.kind][branch].name} 적용`)}><b>{BRANCHES[tower.kind][branch].name}</b><small>{BRANCHES[tower.kind][branch].description}</small></button>)}</div></div>}
        {tower.branch && <p className="branch-summary"><b>{BRANCHES[tower.kind][tower.branch].name}</b> {BRANCHES[tower.kind][tower.branch].description}</p>}
        <div className="sheet-actions"><button className="primary" disabled={!canAct || tower.level >= 5 || view.gold < towerUpgradeCost(tower)} onClick={() => act(() => upgradeTower(state.current, selected), '포탑 강화 완료')}>{tower.level >= 5 ? '최대 강화' : `Lv.${tower.level + 1} 강화 · ${towerUpgradeCost(tower)}`}</button><button className="secondary" disabled={!canAct} onClick={() => act(() => sellTower(state.current, selected), '포탑 회수 완료')}>판매 +{towerSellValue(tower)}</button></div>
      </>}
    </section>}
    <footer className="command-dock" aria-label="전투 명령">
      <button className="support-button" aria-label="지원 포격" disabled={!canAct || view.phase !== 'battle' || view.skillCooldown > 0} onClick={skill}><Icon name="target" /><span>{view.skillCooldown > 0 ? `${Math.ceil(view.skillCooldown)}s` : '지원 포격'}</span></button>
      <button className="speed-button" aria-label={`전투 속도 ${speed}배`} onClick={() => setSpeed(v => v === 1 ? 2 : 1)}>{speed}×</button>
      <button className="primary wave-button" disabled={!canAct || view.phase !== 'ready'} onClick={wave}><Icon name={view.phase === 'battle' ? 'target' : 'play'} /><span>{view.phase === 'battle' ? '교전 중' : ended ? '작전 종료' : '웨이브 시작'}</span></button>
      <button className={`icon-button menu-toggle ${menuOpen ? 'active' : ''}`} aria-label="지휘 패널" aria-expanded={menuOpen} onClick={() => { setMenuOpen(v => !v); setSelected(null); }}><Icon name="menu" /></button>
    </footer>
    {paused && !help && !confirmReset && <button className="paused-banner" onClick={() => setPaused(false)}><Icon name="play" /> 일시정지 · 재개</button>}
    {toast && <div className="toast" role="status">{toast}</div>}
    {help && <Modal title={newOperation ? '경계선' : '작전 안내'} onClose={newOperation ? undefined : () => setHelp(false)}>
      <p className="lead">최후의 전초기지</p><p>방어선을 구축하고 20번의 공격을 저지하십시오.<br />포탑의 전문화와 전술 조합이 이번 작전을 결정합니다.</p>
      <ol className="briefing"><li><b>배치</b> 빈 부지를 눌러 포탑을 건설합니다.</li><li><b>전문화</b> 포탑 Lv.3에서 전투 방식을 선택합니다.</li><li><b>전술</b> 3웨이브마다 하나를 선택해 조합을 강화합니다.</li></ol>
      <div className="control-note">PC: WASD / 방향키 이동 · Q 지원 포격 · SPACE 시작<br />모바일: 조이스틱 이동 · 드래그 화면 이동 · 핀치 확대<br />설정·수리·지휘관 강화는 하단 지휘 패널에서 확인합니다.</div>
      {newOperation && <fieldset className="difficulty-picker"><legend>작전 난이도</legend><div>{(Object.keys(DIFFICULTIES) as Difficulty[]).map(d => <label key={d}><input type="radio" name="difficulty" value={d} checked={difficulty === d} onChange={() => setDifficulty(d)} /><span>{DIFFICULTIES[d].label}</span></label>)}</div></fieldset>}
      <button className="primary full" onClick={() => { if (newOperation) reset(); else setHelp(false); }}>{newOperation ? '작전 개시' : '전장으로 복귀'}<Icon name="play" /></button>
      <small className="save-note">진행은 이 브라우저에 자동 저장됩니다.</small>
    </Modal>}
    {view.pendingTactic && !help && !confirmReset && <Modal title="전술 선택">
      <p>웨이브 {view.wave} 방어 성공. 다음 교전 전에 전술 하나를 선택하십시오.<br />선택한 효과는 이번 작전 내내 유지됩니다.</p>
      <div className="tactic-options">{offers.map(id => <button key={id} onClick={() => act(() => chooseTactic(state.current, id), `${TACTICS[id].name} 전술 적용`)}><span className="eyebrow">TACTICAL UPGRADE</span><b>{TACTICS[id].name}</b><small>{TACTICS[id].description}</small><em>현재 중첩 {view.tactics.filter(t => t === id).length} / 3</em></button>)}</div>
    </Modal>}
    {confirmReset && <Modal title="새 작전을 시작합니까?" onClose={() => setConfirmReset(false)}><p>현재 작전의 진행이 초기화됩니다.</p><button className="primary full" onClick={() => { setConfirmReset(false); setNewOperation(true); newOperationRef.current = true; setHelp(true); }}>난이도 선택</button><button className="text-button" onClick={() => setConfirmReset(false)}>취소</button></Modal>}
    {ended && !help && !confirmReset && <Modal title={view.phase === 'won' ? '방어선 확보' : '방어선 붕괴'}>
      <p>{view.phase === 'won' ? '모든 공격을 저지했습니다. 다른 전술 조합으로 새 작전에 도전하십시오.' : '전술과 포탑 배치를 바꿔 다시 도전하십시오.'}</p>
      <div className="end-stats"><span>도달 웨이브<b>{view.wave} / 20</b></span><span>처치<b>{view.kills}</b></span><span>전술 선택<b>{view.tactics.length}</b></span></div>
      <button className="primary full" onClick={() => { setNewOperation(true); newOperationRef.current = true; setHelp(true); }}>새 작전 준비</button>
    </Modal>}
  </main>;
}

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
