import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { build, heroUpgradeCost, newGame, PADS, repair, restore, SAVE_KEY, serialize, startWave, TOWERS, towerUpgradeCost, update, upgradeHero, upgradeTower, useSkill, type GameState, type TowerKind } from './game';
import { World } from './world';
import './style.css';

function Icon({ name, size=20 }: {name:string;size?:number}) {
  const paths: Record<string,React.ReactNode> = {
    coin: <><circle cx="12" cy="12" r="9"/><path d="M12 7v10m3-8h-4a2 2 0 000 4h2a2 2 0 010 4H9"/></>,
    shield: <><path d="M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/><path d="M8 12l3 3 5-6"/></>,
    sword: <><path d="M5 20l4-4m-3-3l5 5M9 14L19 3l2 1-1 3-9 9M3 18l3 3"/></>,
    flag: <><path d="M5 22V3m0 1c5-5 9 5 15 0v10c-6 5-10-5-15 0"/></>,
    castle: <><path d="M3 21V9h4v3h3V6H8V3h3v2h2V3h3v3h-2v6h3V9h4v12zM10 21v-5h4v5"/></>,
    pause: <><path d="M8 5v14M16 5v14"/></>,
    play: <path d="M8 4l12 8-12 8z"/>,
    sound: <><path d="M4 10h4l5-5v14l-5-5H4zM17 8c4 3 4 5 0 8"/></>,
    mute: <><path d="M4 10h4l5-5v14l-5-5H4zM17 9l5 6m0-6l-5 6"/></>,
    bolt: <path d="M13 2L4 14h7l-1 8 10-13h-7z"/>,
    arrow: <><path d="M5 19L19 5M9 5h10v10M3 15l6 6"/></>,
    close: <path d="M6 6l12 12M18 6L6 18"/>,
    reset: <><path d="M4 10a8 8 0 111 8M4 4v6h6"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.castle}</svg>;
}

function App() {
  const [initial]=useState(()=>restore(localStorageSafeRead()));
  const state=useRef<GameState>(initial || newGame());
  const [view,setView]=useState({...state.current});
  const host=useRef<HTMLDivElement>(null), world=useRef<World|null>(null);
  const [selected,setSelected]=useState<number|null>(null), selectedRef=useRef<number|null>(null);
  const [paused,setPaused]=useState(false), pausedRef=useRef(false);
  const [help,setHelp]=useState(!initial);
  const [confirmReset,setConfirmReset]=useState(false);
  const [sound,setSound]=useState(false), soundRef=useRef(false);
  const [toast,setToast]=useState(''), toastTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const [renderError,setRenderError]=useState(''), [saveError,setSaveError]=useState(false);
  const keys=useRef(new Set<string>()), joystick=useRef({x:0,z:0}), stick=useRef<HTMLDivElement>(null);
  const [knob,setKnob]=useState({x:0,y:0});
  const audio=useRef<AudioContext|null>(null);
  const [speed,setSpeed]=useState(1), speedRef=useRef(1);
  selectedRef.current=selected;pausedRef.current=paused||help||confirmReset; soundRef.current=sound; speedRef.current=speed;
  function notify(message:string) { setToast(message);clearTimeout(toastTimer.current);toastTimer.current=setTimeout(()=>setToast(''),2600); }
  function tone(frequency=520) {
    if(!soundRef.current)return;
    try { audio.current ??= new AudioContext();void audio.current.resume();const oscillator=audio.current.createOscillator(),gain=audio.current.createGain();oscillator.type='triangle';oscillator.frequency.value=frequency;gain.gain.setValueAtTime(.035,audio.current.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.current.currentTime+.12);oscillator.connect(gain).connect(audio.current.destination);oscillator.start();oscillator.stop(audio.current.currentTime+.12); } catch { /* Audio is optional. */ }
  }
  function save() {try {localStorage.setItem(SAVE_KEY,serialize(state.current));setSaveError(false);}catch{setSaveError(true);}}
  function act(action:()=>boolean,success:string) {
    if(action()){setView({...state.current});save();tone();notify(success);}else notify('골드 또는 사용 조건을 확인하세요.');
  }
  function wave() {act(()=>startWave(state.current),`${state.current.wave+1}번째 공세가 시작됩니다!`);}
  function skill() {if(useSkill(state.current)){tone(220);setView({...state.current});notify('서리 폭풍! 주변 적에게 피해와 감속');}}
  function reset() {state.current=newGame();setView({...state.current});setSelected(null);setPaused(false);setConfirmReset(false);save();notify('새로운 왕국의 이야기가 시작됩니다.');}
  useEffect(()=>{
    if(!host.current)return;
    let w:World;
    try {w=new World(host.current,pad=>setSelected(pad));world.current=w;} catch {setRenderError('3D 그래픽을 시작하지 못했습니다. 브라우저의 하드웨어 가속을 켜고 새로고침해 주세요.');return;}
    let last=performance.now(), ui=0, autosave=0, previousKills=state.current.kills,previousPhase=state.current.phase;
    w.renderer.setAnimationLoop((now:number)=>{
      const dt=Math.min((now-last)/1000,.05);last=now;
      if(!pausedRef.current && !document.hidden) {
        const x=(keys.current.has('d')||keys.current.has('arrowright')?1:0)-(keys.current.has('a')||keys.current.has('arrowleft')?1:0)+joystick.current.x;
        const z=(keys.current.has('s')||keys.current.has('arrowdown')?1:0)-(keys.current.has('w')||keys.current.has('arrowup')?1:0)+joystick.current.z;
        for(let i=0;i<speedRef.current;i++)update(state.current,dt,{x,z});
        if(state.current.kills>previousKills){tone(680);previousKills=state.current.kills;}
        if(previousPhase==='battle' && state.current.phase==='ready'){notify(`공세 격퇴! +${45+state.current.wave*5} 골드`);save();}
        previousPhase=state.current.phase;
        ui+=dt;autosave+=dt;
        if(ui>.1){setView({...state.current});ui=0;}
        if(autosave>2){save();autosave=0;}
      }
      w.draw(state.current,selectedRef.current);
    });
    const onKey=(e:KeyboardEvent)=>{
      if(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)return;
      const k=e.key.toLowerCase();
      if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(k))e.preventDefault();
      keys.current.add(k);
      if(e.repeat)return;
      if(k==='escape')setSelected(null);
      if(k==='p')setPaused(v=>!v);
      if(!pausedRef.current){if(k==='q')skill();if(k===' ')wave();}
    };
    const onUp=(e:KeyboardEvent)=>keys.current.delete(e.key.toLowerCase());
    const blur=()=>{keys.current.clear();joystick.current={x:0,z:0};setKnob({x:0,y:0});save();};
    const hidden=()=>{if(document.hidden){setPaused(true);blur();}};
    window.addEventListener('keydown',onKey);window.addEventListener('keyup',onUp);window.addEventListener('blur',blur);window.addEventListener('pagehide',save);document.addEventListener('visibilitychange',hidden);
    return()=>{w.dispose();world.current=null;window.removeEventListener('keydown',onKey);window.removeEventListener('keyup',onUp);window.removeEventListener('blur',blur);window.removeEventListener('pagehide',save);document.removeEventListener('visibilitychange',hidden);clearTimeout(toastTimer.current);};
  },[]);
  function moveStick(e:React.PointerEvent) {
    if(!e.currentTarget.hasPointerCapture(e.pointerId))return;
    const rect=stick.current!.getBoundingClientRect(),dx=e.clientX-rect.left-rect.width/2,dy=e.clientY-rect.top-rect.height/2;
    const distance=Math.hypot(dx,dy),scale=distance>36?36/distance:1;
    setKnob({x:dx*scale,y:dy*scale});joystick.current={x:dx*scale/36,z:dy*scale/36};
  }
  function stopStick(){joystick.current={x:0,z:0};setKnob({x:0,y:0});}
  const tower=selected===null?undefined:view.towers.find(t=>t.pad===selected);
  const ended=view.phase==='won'||view.phase==='lost';
  const canAct=!ended&&!paused&&!help;
  const progress=view.phase==='battle'?Math.round((view.spawned-view.enemies.length)/view.total*100):view.wave===0?0:100;
  return <main className="app">
    <header className="topbar">
      <a className="brand" href="/" aria-label="Emberhold 홈"><span className="brand-mark"><Icon name="castle" size={26}/></span><span>EMBERHOLD<small>작은 왕국의 수호자</small></span></a>
      <div className="resources">
        <div className="resource gold"><Icon name="coin" size={23}/><span><small>보유 골드</small><strong>{view.gold.toLocaleString()}</strong></span></div>
        <div className="resource health"><Icon name="shield" size={23}/><span><small>성문 내구도</small><strong>{Math.ceil(view.hp)}<em> / {view.maxHp}</em></strong><span className="health-meter"><i style={{width:`${view.hp}%`}}/></span></span></div>
      </div>
      <div className="top-actions"><button className="icon-button" aria-label={sound?'소리 끄기':'소리 켜기'} title="소리" onClick={()=>{soundRef.current=!sound;setSound(!sound);tone();}}><Icon name={sound?'sound':'mute'}/></button><button className="icon-button" aria-label="도움말" onClick={()=>setHelp(true)}>?</button><button className="icon-button" aria-label={paused?'계속하기':'일시정지'} title="일시정지 (P)" onClick={()=>setPaused(!paused)}><Icon name={paused?'play':'pause'}/></button></div>
    </header>

    <section className="game-layout">
      <section className="battlefield" aria-label="전장">
        <div className="chapter"><span className="eyebrow"><i/> THE GREENWARD</span><h1>초록빛 변경</h1><p>이 작은 왕국을, 끝까지 지켜주세요.</p></div>
        <div className="wave-badge"><Icon name="flag"/><span>공세 <strong>{String(view.wave||1).padStart(2,'0')}</strong><small> / 20</small></span><span className={`status-dot ${view.phase==='battle'?'active':''}`}/></div>
        <div className="canvas-host" ref={host}/>
        {renderError&&<div className="render-error" role="alert">{renderError}</div>}
        <div className="enemy-entry"><span>↓ &nbsp; 적 진입 방향 &nbsp; ↓</span></div>
        {view.phase==='ready'&&<div className="field-hint"><span className="hint-dot"/>{view.wave===0?'금색 건설 부지를 눌러 첫 방어탑을 세워보세요.':'잠깐의 평화. 방어선을 정비하고 다음 공세를 준비하세요.'}</div>}
        <div className="field-bottom"><span className="live-tag"><i/> {view.phase==='battle'?'전투 진행 중':'방어 준비'}<b>·</b>{view.kills} 처치</span><button className="speed-button" onClick={()=>setSpeed(speed===1?2:1)} aria-label={`전투 속도 ${speed}배`}>{speed}×</button></div>
        <div className="joystick" ref={stick} role="group" aria-label="터치 이동 조이스틱" onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);moveStick(e);}} onPointerMove={moveStick} onPointerUp={stopStick} onPointerCancel={stopStick} onLostPointerCapture={stopStick}><span className="stick-cross">✣</span><i style={{transform:`translate(${knob.x}px,${knob.y}px)`}}/></div>
        <button className="mobile-skill" aria-label="서리 폭풍 사용" disabled={!canAct||view.phase!=='battle'||view.skillCooldown>0} onClick={skill}><Icon name="bolt" size={26}/><small>{view.skillCooldown>0?`${Math.ceil(view.skillCooldown)}s`:'Q · 폭풍'}</small></button>
      </section>

      <aside className={`sidebar ${selected!==null?'is-selected':''}`} aria-label="왕국 관리">
        <div className="sidebar-header"><div><span className="eyebrow">KINGDOM DEFENSE</span><h2>{selected===null?'방어선 구축':`건설 부지 ${String(selected+1).padStart(2,'0')}`}</h2></div>{selected!==null?<button className="icon-button close-panel" aria-label="건설 패널 닫기" onClick={()=>setSelected(null)}><Icon name="close"/></button>:<span className="tiny-emblem"><Icon name="castle" size={28}/></span>}</div>
        <div className="sidebar-scroll">
        {selected===null?<>
          <p className="panel-intro">적들이 오기 전에 준비하세요.<br/>전장의 <b>금색 원</b>을 선택하면 건설할 수 있어요.</p>
          <div className="mini-map" aria-label="건설 부지 선택">{PADS.map((p,i)=><button key={i} className={view.towers.some(t=>t.pad===i)?'occupied':''} style={{left:`${50+p.x*3.7}%`,top:`${24+(p.z+6)*4.8}%`}} aria-label={`건설 부지 ${i+1} 선택`} onClick={()=>setSelected(i)}>{view.towers.find(t=>t.pad===i)?TOWERS[view.towers.find(t=>t.pad===i)!.kind].icon:'+'}</button>)}<span className="map-path"/><span className="map-keep"><Icon name="castle" size={20}/></span><span className="map-caption">8 BUILD SITES</span></div>
          <div className="section-title"><span>방어 건물</span><small>{view.towers.length} / 8 건설됨</small></div>
          {(Object.keys(TOWERS) as TowerKind[]).map(kind=><div className="tower-preview" key={kind}><span style={{color:TOWERS[kind].color}}>{TOWERS[kind].icon}</span><div><b>{TOWERS[kind].name}</b><small>{TOWERS[kind].subtitle}</small></div><em>{TOWERS[kind].cost}<Icon name="coin" size={12}/></em></div>)}
        </>:tower?<>
          <div className={`tower-portrait ${tower.kind}`}><span>{TOWERS[tower.kind].icon}</span><small>LEVEL {tower.level}</small></div>
          <h3 className="tower-name">{TOWERS[tower.kind].name}</h3><p className="panel-intro centered">{TOWERS[tower.kind].subtitle}<br/>이 부지의 든든한 수호자입니다.</p>
          <div className="tower-stats"><span>공격력<strong>{Math.round(TOWERS[tower.kind].damage*(1+(tower.level-1)*.7))}</strong></span><span>사거리<strong>{(TOWERS[tower.kind].range+(tower.level-1)*.3).toFixed(1)}</strong></span><span>레벨<strong>{tower.level} / 5</strong></span></div>
          <button className="primary full" disabled={!canAct||tower.level>=5||view.gold<towerUpgradeCost(tower)} onClick={()=>act(()=>upgradeTower(state.current,selected!),'방어탑을 강화했습니다!')}>{tower.level>=5?'최대 레벨 달성':<>건물 강화 <span>{towerUpgradeCost(tower)} G ↑</span></>}</button>
          <p className="fine-print">강화하면 공격력, 공격 속도, 사거리가 증가합니다.</p>
        </>:<>
          <p className="panel-intro">이곳을 지킬 건물을 선택하세요.<br/>건설 즉시 자동으로 적을 공격합니다.</p>
          {(Object.keys(TOWERS) as TowerKind[]).map(kind=><button key={kind} className={`build-card ${kind}`} disabled={!canAct||view.gold<TOWERS[kind].cost} onClick={()=>act(()=>build(state.current,selected!,kind),`${TOWERS[kind].name} 건설 완료!`)}><span className="build-icon">{TOWERS[kind].icon}</span><span className="build-info"><strong>{TOWERS[kind].name}</strong><small>{TOWERS[kind].subtitle}</small><em>공격 {TOWERS[kind].damage} · 사거리 {TOWERS[kind].range}</em></span><span className="build-price"><Icon name="coin" size={14}/>{TOWERS[kind].cost}<b>건설 +</b></span></button>)}
          <div className="tip"><Icon name="bolt" size={17}/><p>대포탑 앞에 서리탑을 세우면<br/>느려진 적들을 한 번에 공격할 수 있어요.</p></div>
        </>}
        <div className="repair-card"><div><Icon name="shield"/><span><b>성문 수리</b><small>내구도 35 회복</small></span></div><button disabled={!canAct||view.gold<60||view.hp>=100} onClick={()=>act(()=>repair(state.current),'성문 내구도 +35')}>60 G +</button></div>
        </div>
        <div className="sidebar-footer"><span><i/> {saveError?'저장 공간을 확인해주세요':'브라우저에 자동 저장'}</span><button onClick={()=>setConfirmReset(true)} aria-label="새 게임"><Icon name="reset" size={15}/></button></div>
      </aside>
    </section>

    <footer className="command-bar">
      <div className="hero-card"><div className="hero-avatar"><Icon name="sword" size={30}/><span>{view.heroLevel}</span></div><div className="hero-info"><small>왕국의 수호자</small><b>푸른 망토의 기사</b><span>공격 {18+(view.heroLevel-1)*11} <i>·</i> 자동 공격</span></div><button className="hero-upgrade" disabled={!canAct||view.gold<heroUpgradeCost(view)||view.heroLevel>=10} onClick={()=>act(()=>upgradeHero(state.current),'영웅을 강화했습니다!')}>강화 ↑<small>{view.heroLevel>=10?'MAX':`${heroUpgradeCost(view)} G`}</small></button></div>
      <div className="keyboard-tip"><span><kbd>W</kbd><br/><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span><small>이동<br/><b>사거리 내 자동 공격</b></small></div>
      <button className="skill-button" disabled={!canAct||view.phase!=='battle'||view.skillCooldown>0} onClick={skill}><span className="skill-symbol"><Icon name="bolt" size={23}/></span><span><b>서리 폭풍 <kbd>Q</kbd></b><small>{view.skillCooldown>0?`${Math.ceil(view.skillCooldown)}초 후 사용 가능`:'주변 적에게 범위 피해 + 감속'}</small></span></button>
      <div className="wave-action"><div className="wave-progress"><span>{view.phase==='battle'?`남은 적 ${view.total-view.spawned+view.enemies.length}`:`${view.wave===0?'첫 번째':view.wave+1+'번째'} 공세 준비`}<small>{view.phase==='battle'?`${progress}% 격퇴`:view.wave%5===4?'다음 공세에 보스 등장':'준비되면 출격하세요'}</small></span><i><b style={{width:`${progress}%`}}/></i></div><button className="primary next-wave" disabled={!canAct||view.phase!=='ready'} onClick={wave}><Icon name={view.phase==='battle'?'sword':'play'} size={18}/>{view.phase==='battle'?'전투 중':'공세 시작'}<kbd>SPACE</kbd></button></div>
    </footer>
    <div className="bottom-note"><span>EMBERHOLD <i>•</i> SOLO STRATEGY DEFENSE</span><span>금색 원: 건설 / 선택 <i>·</i> P: 일시정지 <i>·</i> 5공세마다 보스</span><a href="/logout">왕국 나가기 ↗</a></div>
    {toast&&<div className="toast" role="status">{toast}</div>}
    {help&&<div className="modal-backdrop"><section className="modal welcome" role="dialog" aria-modal="true" aria-labelledby="welcome-title"><span className="modal-seal"><Icon name="castle" size={38}/></span><span className="eyebrow">A LITTLE KINGDOM. A GREAT DEFENDER.</span><h2 id="welcome-title">작은 왕국의<br/><em>커다란 모험.</em></h2><p>푸른 망토를 걸치고, 밀려오는 적들로부터<br/>당신만의 왕국을 지켜주세요.</p><div className="welcome-steps"><span><Icon name="sword"/><b>적을 처치하고</b><small>자동 공격으로 골드 획득</small></span><span><Icon name="castle"/><b>방어선을 세우고</b><small>금색 부지에 건설·강화</small></span><span><Icon name="flag"/><b>20공세를 버티세요</b><small>5공세마다 강력한 보스</small></span></div><div className="control-note">PC: WASD / 방향키 이동 · Q 스킬 · SPACE 공세 시작<br/>모바일: 왼쪽 조이스틱 이동 · 오른쪽 번개 스킬</div><button className="primary full" onClick={()=>{setHelp(false);save();}}>{view.wave>0?'왕국으로 돌아가기':'왕국 지키기'}<Icon name="arrow" size={18}/></button><small className="save-note">진행 상황은 이 브라우저에 자동 저장됩니다.</small></section></div>}
    {paused&&!help&&!confirmReset&&!ended&&<div className="modal-backdrop"><section className="modal compact" role="dialog" aria-modal="true" aria-labelledby="pause-title"><span className="modal-seal"><Icon name="pause" size={32}/></span><span className="eyebrow">TAKE A LITTLE BREATH</span><h2 id="pause-title">잠깐의 휴식</h2><p>왕국은 수호자님을 기다리고 있습니다.</p><button className="primary full" onClick={()=>setPaused(false)}>계속하기<Icon name="play" size={18}/></button><button className="text-button" onClick={()=>setConfirmReset(true)}>새 게임</button></section></div>}
    {confirmReset&&<div className="modal-backdrop"><section className="modal compact" role="dialog" aria-modal="true" aria-labelledby="reset-title"><h2 id="reset-title">새로운 이야기</h2><p>현재 진행 상황을 지우고<br/>첫 공세부터 다시 시작할까요?</p><button className="primary full" onClick={reset}>새 게임 시작</button><button className="text-button" onClick={()=>setConfirmReset(false)}>현재 게임 유지</button></section></div>}
    {ended&&!help&&<div className="modal-backdrop"><section className="modal compact" role="dialog" aria-modal="true" aria-labelledby="end-title"><span className="modal-seal"><Icon name={view.phase==='won'?'flag':'shield'} size={36}/></span><span className="eyebrow">{view.phase==='won'?'THE KINGDOM STANDS':'ANOTHER DAWN WILL COME'}</span><h2 id="end-title">{view.phase==='won'?'왕국을 지켜냈습니다!':'성문이 무너졌습니다'}</h2><p>{view.phase==='won'?'20번의 공세를 이겨낸 수호자의 이름은 오래 기억될 거예요.':'다시 방어선을 세워 더 멀리 나아가세요.'}</p><div className="end-stats"><span>도달 공세<b>{view.wave} / 20</b></span><span>처치한 적<b>{view.kills}</b></span></div><button className="primary full" onClick={reset}>다시 도전하기<Icon name="reset" size={18}/></button></section></div>}
  </main>;
}
function localStorageSafeRead(){try{return localStorage.getItem(SAVE_KEY);}catch{return null;}}
createRoot(document.getElementById('root')!).render(<App/>);
