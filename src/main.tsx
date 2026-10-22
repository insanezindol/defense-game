import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  build,
  DIFFICULTIES,
  DEFAULT_DIFFICULTY,
  heroUpgradeCost,
  newGame,
  PADS,
  repair,
  restore,
  SAVE_KEY,
  serialize,
  startWave,
  TOWERS,
  towerUpgradeCost,
  update,
  upgradeHero,
  upgradeTower,
  useSkill,
  type GameState,
  type Difficulty,
  type TowerKind,
} from "./game";
import { World } from "./world";
import { HOME, MAP_BOUNDS, ROAD_POINTS } from "./battlefield";
import { MIN_ZOOM, MAX_ZOOM } from "./world-models";
import "./style.css";

function DifficultyPicker({ value, onChange }: {
  value: Difficulty;
  onChange: (difficulty: Difficulty) => void;
}) {
  return (
    <fieldset className="difficulty-picker">
      <legend>난이도 선택</legend>
      <div className="difficulty-options">
        {(Object.keys(DIFFICULTIES) as Difficulty[]).map((difficulty) => (
          <label key={difficulty}>
            <input type="radio" name="difficulty" value={difficulty}
              checked={value === difficulty} onChange={() => onChange(difficulty)} />
            <span><b>{DIFFICULTIES[difficulty].label}</b></span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    coin: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v10m3-8h-4a2 2 0 000 4h2a2 2 0 010 4H9" />
      </>
    ),
    shield: (
      <>
        <path d="M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6z" />
        <path d="M8 12l3 3 5-6" />
      </>
    ),
    sword: (
      <>
        <path d="M5 5c-3 0-3 5-3 8v5a3 3 0 006 0V9c0-2-1-4-3-4zM16 3c-3 0-3 5-3 8v5a3 3 0 006 0V7c0-2-1-4-3-4zM2 12l6-2m5 0l6-2" />
      </>
    ),
    flag: (
      <>
        <path d="M5 22V3m0 1c5-5 9 5 15 0v10c-6 5-10-5-15 0" />
      </>
    ),
    castle: (
      <>
        <path d="M3 11l9-8 9 8M5 10v11h14V10M10 21v-7h4v7" />
      </>
    ),
    pause: (
      <>
        <path d="M8 5v14M16 5v14" />
      </>
    ),
    play: <path d="M8 4l12 8-12 8z" />,
    sound: (
      <>
        <path d="M4 10h4l5-5v14l-5-5H4zM17 8c4 3 4 5 0 8" />
      </>
    ),
    mute: (
      <>
        <path d="M4 10h4l5-5v14l-5-5H4zM17 9l5 6m0-6l-5 6" />
      </>
    ),
    bolt: <path d="M12 2S4 11 4 15a8 8 0 0016 0c0-4-8-13-8-13zM8 15c0 3 2 4 4 4" />,
    arrow: (
      <>
        <path d="M5 19L19 5M9 5h10v10M3 15l6 6" />
      </>
    ),
    close: <path d="M6 6l12 12M18 6L6 18" />,
    reset: (
      <>
        <path d="M4 10a8 8 0 111 8M4 4v6h6" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.castle}
    </svg>
  );
}

function App() {
  const [initial] = useState(() => restore(localStorageSafeRead()));
  const state = useRef<GameState>(initial || newGame());
  const [view, setView] = useState({ ...state.current });
  const host = useRef<HTMLDivElement>(null),
    world = useRef<World | null>(null);
  const [selected, setSelected] = useState<number | null>(null),
    selectedRef = useRef<number | null>(null);
  const [managementOpen, setManagementOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [paused, setPaused] = useState(false),
    pausedRef = useRef(false);
  const [help, setHelp] = useState(!initial);
  const [choosingDifficulty, setChoosingDifficulty] = useState(!initial);
  const choosingDifficultyRef = useRef(!initial);
  const [difficulty, setDifficulty] = useState<Difficulty>(initial?.difficulty ?? DEFAULT_DIFFICULTY);
  const [confirmReset, setConfirmReset] = useState(false);
  const [sound, setSound] = useState(false),
    soundRef = useRef(false);
  const [toast, setToast] = useState(""),
    toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [renderError, setRenderError] = useState(""),
    [saveError, setSaveError] = useState(false);
  const keys = useRef(new Set<string>()),
    joystick = useRef({ x: 0, z: 0 }),
    stick = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const audio = useRef<AudioContext | null>(null);
  const [speed, setSpeed] = useState(1),
    speedRef = useRef(1);
  selectedRef.current = selected;
  pausedRef.current = paused || help || confirmReset;
  soundRef.current = sound;
  speedRef.current = speed;
  function notify(message: string) {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2600);
  }
  function tone(frequency = 520) {
    if (!soundRef.current) return;
    try {
      audio.current ??= new AudioContext();
      void audio.current.resume();
      const oscillator = audio.current.createOscillator(),
        gain = audio.current.createGain();
      oscillator.type = "triangle";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.035, audio.current.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        audio.current.currentTime + 0.12,
      );
      oscillator.connect(gain).connect(audio.current.destination);
      oscillator.start();
      oscillator.stop(audio.current.currentTime + 0.12);
    } catch {
      /* Audio is optional. */
    }
  }
  function save() {
    if (choosingDifficultyRef.current) return;
    try {
      localStorage.setItem(SAVE_KEY, serialize(state.current));
      setSaveError(false);
    } catch {
      setSaveError(true);
    }
  }
  function act(action: () => boolean, success: string) {
    if (action()) {
      setView({ ...state.current });
      save();
      tone();
      notify(success);
    } else notify("용돈이 모자라거나 아직 때가 아니에요!");
  }
  function wave() {
    act(
      () => startWave(state.current),
      `딩동! ${state.current.wave + 1}번째 불청객이 왔어요!`,
    );
  }
  function skill() {
    if (useSkill(state.current)) {
      tone(220);
      setView({ ...state.current });
      notify("물벼락 대청소! 불청객도 뽀송하게!");
    }
  }
  function reset() {
    state.current = newGame(difficulty);
    choosingDifficultyRef.current = false;
    setView({ ...state.current });
    setSelected(null);
    setManagementOpen(false);
    world.current?.resetView();
    setPaused(false);
    setConfirmReset(false);
    setChoosingDifficulty(false);
    setHelp(false);
    save();
    notify("슬리퍼 장착! 우리집 사수 시작!");
  }
  useEffect(() => {
    if (!host.current) return;
    let w: World;
    try {
      w = new World(host.current, (pad) => setSelected(pad), setZoom);
      world.current = w;
    } catch {
      setRenderError(
        "3D 그래픽을 시작하지 못했습니다. 브라우저의 하드웨어 가속을 켜고 새로고침해 주세요.",
      );
      return;
    }
    let last = performance.now(),
      ui = 0,
      autosave = 0,
      previousKills = state.current.kills,
      previousPhase = state.current.phase;
    w.renderer.setAnimationLoop((now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (!pausedRef.current && !document.hidden) {
        const x =
          (keys.current.has("d") || keys.current.has("arrowright") ? 1 : 0) -
          (keys.current.has("a") || keys.current.has("arrowleft") ? 1 : 0) +
          joystick.current.x;
        const z =
          (keys.current.has("s") || keys.current.has("arrowdown") ? 1 : 0) -
          (keys.current.has("w") || keys.current.has("arrowup") ? 1 : 0) +
          joystick.current.z;
        const movement = w.screenInput(x, z);
        for (let i = 0; i < speedRef.current; i++)
          update(state.current, dt, movement);
        if (state.current.kills > previousKills) {
          tone(680);
          previousKills = state.current.kills;
        }
        if (previousPhase === "battle" && state.current.phase === "ready") {
          notify(`불청객 퇴근! 용돈 +${45 + state.current.wave * 5}`);
          save();
        }
        previousPhase = state.current.phase;
        ui += dt;
        autosave += dt;
        if (ui > 0.1) {
          setView({ ...state.current });
          ui = 0;
        }
        if (autosave > 2) {
          save();
          autosave = 0;
        }
      }
      w.draw(state.current, selectedRef.current);
    });
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      const k = e.key.toLowerCase();
      if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k))
        e.preventDefault();
      keys.current.add(k);
      if (e.repeat) return;
      if (k === "escape") {
        setSelected(null);
        setManagementOpen(false);
      }
      if (k === "p") setPaused((v) => !v);
      if (!pausedRef.current) {
        if (k === "q") skill();
        if (k === " ") wave();
      }
    };
    const onUp = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    const blur = () => {
      keys.current.clear();
      joystick.current = { x: 0, z: 0 };
      setKnob({ x: 0, y: 0 });
      save();
    };
    const hidden = () => {
      if (document.hidden) {
        setPaused(true);
        blur();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", blur);
    window.addEventListener("pagehide", save);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      w.dispose();
      world.current = null;
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", blur);
      window.removeEventListener("pagehide", save);
      document.removeEventListener("visibilitychange", hidden);
      clearTimeout(toastTimer.current);
    };
  }, []);
  function moveStick(e: React.PointerEvent) {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const rect = stick.current!.getBoundingClientRect(),
      dx = e.clientX - rect.left - rect.width / 2,
      dy = e.clientY - rect.top - rect.height / 2;
    const distance = Math.hypot(dx, dy),
      scale = distance > 36 ? 36 / distance : 1;
    setKnob({ x: dx * scale, y: dy * scale });
    joystick.current = { x: (dx * scale) / 36, z: (dy * scale) / 36 };
  }
  function stopStick() {
    joystick.current = { x: 0, z: 0 };
    setKnob({ x: 0, y: 0 });
  }
  const tower =
    selected === null ? undefined : view.towers.find((t) => t.pad === selected);
  const ended = view.phase === "won" || view.phase === "lost";
  const canAct = !ended && !paused && !help;
  const progress =
    view.phase === "battle"
      ? Math.round(((view.spawned - view.enemies.length) / view.total) * 100)
      : view.wave === 0
        ? 0
        : 100;
  return (
    <main className="app">
      <section className="game-layout">
        <section className="battlefield" aria-label="전장">
          <header className="topbar">
            <a className="brand" href="/" aria-label="우리집을 지켜라! 홈">
              <span className="brand-mark">
                <Icon name="castle" size={26} />
              </span>
              <span>
                우리집을 지켜라!<small>오늘도 평화로운 우리 동네?</small>
              </span>
            </a>
            <div className="resources">
              <div className="resource gold">
                <Icon name="coin" size={23} />
                <span>
                  <small>용돈</small>
                  <strong>{view.gold.toLocaleString()}</strong>
                </span>
              </div>
              <div className="resource health">
                <Icon name="shield" size={23} />
                <span>
                  <small>우리집 멀쩡함</small>
                  <strong>
                    {Math.ceil(view.hp)}
                    <em> / {view.maxHp}</em>
                  </strong>
                  <span className="health-meter">
                    <i style={{ width: `${(view.hp / view.maxHp) * 100}%` }} />
                  </span>
                </span>
              </div>
            </div>
            <div className="top-actions">
              <button
                className="icon-button"
                aria-label={sound ? "소리 끄기" : "소리 켜기"}
                title="소리"
                onClick={() => {
                  soundRef.current = !sound;
                  setSound(!sound);
                  tone();
                }}
              >
                <Icon name={sound ? "sound" : "mute"} />
              </button>
              <button
                className="icon-button"
                aria-label="도움말"
                onClick={() => setHelp(true)}
              >
                ?
              </button>
              <button
                className="icon-button"
                aria-label={paused ? "계속하기" : "일시정지"}
                title="일시정지 (P)"
                onClick={() => setPaused(!paused)}
              >
                <Icon name={paused ? "play" : "pause"} />
              </button>
            </div>
          </header>
          <div className="chapter">
            <span className="eyebrow">
              <i /> WELCOME TO OUR BLOCK
            </span>
            <h1>오늘도 집이 최고!</h1>
            <p>현관 앞은 우리가 접수한다! · {DIFFICULTIES[view.difficulty].label}</p>
          </div>
          <div className="wave-badge">
            <Icon name="flag" />
            <span>
              딩동 <strong>{String(view.wave || 1).padStart(2, "0")}</strong>
              <small> / 20</small>
            </span>
            <span
              className={`status-dot ${view.phase === "battle" ? "active" : ""}`}
            />
          </div>
          <div className="canvas-host" ref={host} />
          <div className="zoom-controls" role="group" aria-label="전장 확대·축소">
            <button aria-label="전장 축소" title="축소" disabled={zoom <= MIN_ZOOM}
              onClick={() => world.current?.setZoom(zoom / 1.2)}>−</button>
            <button className="zoom-reset" aria-label="전장 배율 초기화" title="기본 배율로"
              onClick={() => world.current?.setZoom(1)}>{Math.round(zoom * 100)}%</button>
            <button aria-label="전장 확대" title="확대" disabled={zoom >= MAX_ZOOM}
              onClick={() => world.current?.setZoom(zoom * 1.2)}>+</button>
            <button className="view-reset" aria-label="기본 시점으로 돌아가기" title="기본 시점"
              onClick={() => world.current?.resetView()}><Icon name="reset" size={17} /></button>
          </div>
          {renderError && (
            <div className="render-error" role="alert">
              {renderError}
            </div>
          )}
          <div className="enemy-entry">
            <span>↓ &nbsp; 불청객 오는 길 &nbsp; ↓</span>
          </div>
          {view.phase === "ready" && (
            <div className="field-hint">
              <span className="hint-dot" />
              {view.wave === 0
                ? "반짝이는 빈자리에 살림살이 하나 놔볼까요?"
                : "잠깐 조용하네? 살림살이 보충할 시간!"}
            </div>
          )}
          <div className="field-bottom">
            <span className="live-tag">
              <i /> {view.phase === "battle" ? "불청객 응대 중" : "동네 순찰 중"}
              <b>·</b>
              {view.kills}명 귀가
            </span>
            <button
              className="speed-button"
              onClick={() => setSpeed(speed === 1 ? 2 : 1)}
              aria-label={`전투 속도 ${speed}배`}
            >
              {speed}×
            </button>
          </div>
          <div
            className="joystick"
            ref={stick}
            role="group"
            aria-label="터치 이동 조이스틱"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              moveStick(e);
            }}
            onPointerMove={moveStick}
            onPointerUp={stopStick}
            onPointerCancel={stopStick}
            onLostPointerCapture={stopStick}
          >
            <span className="stick-cross">✣</span>
            <i style={{ transform: `translate(${knob.x}px,${knob.y}px)` }} />
          </div>
          <button
            className="mobile-skill"
            aria-label="물벼락 대청소 사용"
            disabled={
              !canAct || view.phase !== "battle" || view.skillCooldown > 0
            }
            onClick={skill}
          >
            <Icon name="bolt" size={26} />
            <small>
              {view.skillCooldown > 0
                ? `${Math.ceil(view.skillCooldown)}s`
                : "물벼락"}
            </small>
          </button>

          <button
            className="management-toggle"
            aria-controls="home-panel"
            aria-expanded={managementOpen || selected !== null}
            onClick={() => {
              if (managementOpen || selected !== null) {
                setSelected(null);
                setManagementOpen(false);
              } else setManagementOpen(true);
            }}
          >
            <Icon name="castle" size={16} /> 건설·관리
          </button>
          <aside
            id="home-panel"
            className={`sidebar ${selected !== null ? "is-selected" : ""} ${managementOpen || selected !== null ? "is-open" : ""}`}
            aria-label="우리집 관리"
          >
            <div className="sidebar-header">
              <div>
                <span className="eyebrow">HOME SWEET HOME</span>
                <h2>
                  {selected === null
                    ? "우리집 살림살이"
                    : `빈자리 ${String(selected + 1).padStart(2, "0")}`}
                </h2>
              </div>
              {selected !== null || managementOpen ? (
                <button
                  className="icon-button close-panel"
                  aria-label="건설 패널 닫기"
                  onClick={() => {
                    setSelected(null);
                    setManagementOpen(false);
                  }}
                >
                  <Icon name="close" />
                </button>
              ) : (
                <span className="tiny-emblem">
                  <Icon name="castle" size={28} />
                </span>
              )}
            </div>
            <div className="sidebar-scroll">
              {selected === null ? (
                <>
                  <p className="panel-intro">
                    슬리퍼만으론 조금 바쁠 수 있어요.
                    <br />
                    동네의 <b>반짝이는 빈자리</b>를 골라주세요.
                  </p>
                  <div className="mini-map" aria-label="건설 부지 선택">
                    {PADS.map((p, i) => (
                      <button
                        key={i}
                        className={
                          view.towers.some((t) => t.pad === i) ? "occupied" : ""
                        }
                        style={{
                          left: `${((p.x - MAP_BOUNDS.minX) / (MAP_BOUNDS.maxX - MAP_BOUNDS.minX)) * 100}%`,
                          top: `${((p.z - MAP_BOUNDS.minZ) / (MAP_BOUNDS.maxZ - MAP_BOUNDS.minZ)) * 100}%`,
                        }}
                        aria-label={`건설 부지 ${i + 1} 선택`}
                        onClick={() => setSelected(i)}
                      >
                        {view.towers.find((t) => t.pad === i)
                          ? TOWERS[view.towers.find((t) => t.pad === i)!.kind]
                              .icon
                          : "+"}
                      </button>
                    ))}
                    <svg className="map-road" viewBox={`${MAP_BOUNDS.minX} ${MAP_BOUNDS.minZ} ${MAP_BOUNDS.maxX - MAP_BOUNDS.minX} ${MAP_BOUNDS.maxZ - MAP_BOUNDS.minZ}`} preserveAspectRatio="none" aria-hidden="true">
                      <polyline points={ROAD_POINTS.map((p) => `${p.x},${p.z}`).join(" ")} />
                    </svg>
                    <span className="map-keep" style={{
                      left: `${((HOME.x - MAP_BOUNDS.minX) / (MAP_BOUNDS.maxX - MAP_BOUNDS.minX)) * 100}%`,
                      top: `${((HOME.z - MAP_BOUNDS.minZ) / (MAP_BOUNDS.maxZ - MAP_BOUNDS.minZ)) * 100}%`,
                    }}>
                      <Icon name="castle" size={20} />
                    </span>
                    <span className="map-caption">{PADS.length}곳에 살림살이 설치 가능</span>
                  </div>
                  <div className="section-title">
                    <span>든든한 살림살이</span>
                    <small>{view.towers.length} / {PADS.length} 설치</small>
                  </div>
                  {(Object.keys(TOWERS) as TowerKind[]).map((kind) => (
                    <div className="tower-preview" key={kind}>
                      <span style={{ color: TOWERS[kind].color }}>
                        {TOWERS[kind].icon}
                      </span>
                      <div>
                        <b>{TOWERS[kind].name}</b>
                        <small>{TOWERS[kind].subtitle}</small>
                      </div>
                      <em>
                        {TOWERS[kind].cost}
                        <Icon name="coin" size={12} />
                      </em>
                    </div>
                  ))}
                </>
              ) : tower ? (
                <>
                  <div className={`tower-portrait ${tower.kind}`}>
                    <span>{TOWERS[tower.kind].icon}</span>
                    <small>LEVEL {tower.level}</small>
                  </div>
                  <h3 className="tower-name">{TOWERS[tower.kind].name}</h3>
                  <p className="panel-intro centered">
                    {TOWERS[tower.kind].subtitle}
                    <br />오늘도 현관 앞 근무 중!
                  </p>
                  <div className="tower-stats">
                    <span>
                      공격력
                      <strong>
                        {Math.round(
                          TOWERS[tower.kind].damage *
                            (1 + (tower.level - 1) * 0.7),
                        )}
                      </strong>
                    </span>
                    <span>
                      사거리
                      <strong>
                        {(
                          TOWERS[tower.kind].range +
                          (tower.level - 1) * 0.3
                        ).toFixed(1)}
                      </strong>
                    </span>
                    <span>
                      레벨<strong>{tower.level} / 5</strong>
                    </span>
                  </div>
                  <button
                    className="primary full"
                    disabled={
                      !canAct ||
                      tower.level >= 5 ||
                      view.gold < towerUpgradeCost(tower)
                    }
                    onClick={() =>
                      act(
                        () => upgradeTower(state.current, selected!),
                        "살림살이 업그레이드! 이 맛에 용돈 벌지!",
                      )
                    }
                  >
                    {tower.level >= 5 ? (
                      "최대 레벨 달성"
                    ) : (
                      <>
                        더 튼튼하게 <span>{towerUpgradeCost(tower)} 용돈 ↑</span>
                      </>
                    )}
                  </button>
                  <p className="fine-print">
                    강화하면 공격력, 공격 속도, 사거리가 증가합니다.
                  </p>
                </>
              ) : (
                <>
                  <p className="panel-intro">
                    이 자리에 뭘 놓을까요?
                    <br />
                    놓기만 하면 알아서 불청객을 돌려보내요.
                  </p>
                  {(Object.keys(TOWERS) as TowerKind[]).map((kind) => (
                    <button
                      key={kind}
                      className={`build-card ${kind}`}
                      disabled={!canAct || view.gold < TOWERS[kind].cost}
                      onClick={() =>
                        act(
                          () => build(state.current, selected!, kind),
                          `${TOWERS[kind].name} 건설 완료!`,
                        )
                      }
                    >
                      <span className="build-icon">{TOWERS[kind].icon}</span>
                      <span className="build-info">
                        <strong>{TOWERS[kind].name}</strong>
                        <small>{TOWERS[kind].subtitle}</small>
                        <em>
                          공격 {TOWERS[kind].damage} · 사거리 {TOWERS[kind].range}
                        </em>
                      </span>
                      <span className="build-price">
                        <Icon name="coin" size={14} />
                        {TOWERS[kind].cost}
                        <b>건설 +</b>
                      </span>
                    </button>
                  ))}
                  <div className="tip">
                    <Icon name="bolt" size={17} />
                    <p>
                      택배 상자 대포 앞에 선풍기를 놓으면
                      <br />
                      바람 맞는 불청객에게 택배가 팡!
                    </p>
                  </div>
                </>
              )}
              <div className="repair-card">
                <div>
                  <Icon name="shield" />
                  <span>
                    <b>우리집 땜질</b>
                    <small>멀쩡함 35 회복</small>
                  </span>
                </div>
                <button
                  disabled={!canAct || view.gold < 60 || view.hp >= view.maxHp}
                  onClick={() =>
                    act(() => repair(state.current), "우리집 멀쩡함 +35")
                  }
                >
                  60 용돈 +
                </button>
              </div>
            </div>
            <div className="sidebar-footer">
              <span>
                <i />{" "}
                {saveError ? "저장 공간을 확인해주세요" : "브라우저에 자동 저장"}
              </span>
              <button onClick={() => setConfirmReset(true)} aria-label="새 게임">
                <Icon name="reset" size={15} />
              </button>
            </div>
          </aside>

          <footer className="command-bar">
            <div className="hero-card">
              <div className="hero-avatar">
                <Icon name="sword" size={30} />
                <span>{view.heroLevel}</span>
              </div>
              <div className="hero-info">
                <small>동네 최강 슬리퍼</small>
                <b>슬리퍼 집주인</b>
                <span>
                  공격 {18 + (view.heroLevel - 1) * 11} <i>·</i> 자동 공격
                </span>
              </div>
              <button
                className="hero-upgrade"
                disabled={
                  !canAct ||
                  view.gold < heroUpgradeCost(view) ||
                  view.heroLevel >= 10
                }
                onClick={() =>
                  act(() => upgradeHero(state.current), "슬리퍼가 더 매워졌어요!")
                }
              >
                강화 ↑
                <small>
                  {view.heroLevel >= 10 ? "MAX" : `${heroUpgradeCost(view)} 용돈`}
                </small>
              </button>
            </div>
            <div className="keyboard-tip">
              <span>
                <kbd>W</kbd>
                <br />
                <kbd>A</kbd>
                <kbd>S</kbd>
                <kbd>D</kbd>
              </span>
              <small>
                이동
                <br />
                <b>사거리 내 자동 공격</b>
              </small>
            </div>
            <button
              className="skill-button"
              disabled={
                !canAct || view.phase !== "battle" || view.skillCooldown > 0
              }
              onClick={skill}
            >
              <span className="skill-symbol">
                <Icon name="bolt" size={23} />
              </span>
              <span>
                <b>
                  물벼락 대청소 <kbd>Q</kbd>
                </b>
                <small>
                  {view.skillCooldown > 0
                    ? `${Math.ceil(view.skillCooldown)}초 후 사용 가능`
                    : "주변 불청객에게 시원한 물 한 바가지"}
                </small>
              </span>
            </button>
            <div className="wave-action">
              <div className="wave-progress">
                <span>
                  {view.phase === "battle"
                    ? `불청객 ${view.total - view.spawned + view.enemies.length}`
                    : `${view.wave === 0 ? "첫 번째" : view.wave + 1 + "번째"} 방문 준비`}
                  <small>
                    {view.phase === "battle"
                      ? `${progress}% 격퇴`
                      : view.wave % 5 === 4
                        ? "다음엔 덩치 큰 이웃 등장"
                        : "용돈 쓰고 문 열어주세요"}
                  </small>
                </span>
                <i>
                  <b style={{ width: `${progress}%` }} />
                </i>
              </div>
              <button
                className="primary next-wave"
                disabled={!canAct || view.phase !== "ready"}
                onClick={wave}
              >
                <Icon name={view.phase === "battle" ? "sword" : "play"} size={18} />
                {view.phase === "battle" ? "응대 중!" : "또 온다!"}
                <kbd>SPACE</kbd>
              </button>
            </div>
          </footer>
          <div className="bottom-note">
            <span>
              우리집을 지켜라! <i>•</i> 슬리퍼로 지키는 평화
            </span>
            <span>
              반짝이는 빈자리: 설치 / 선택 <i>·</i> P: 일시정지 <i>·</i> 5번마다 덩치 큰 이웃
            </span>
            <span>내 집이 제일 좋아</span>
          </div>
        </section>
      </section>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
      {help && (
        <div className="modal-backdrop">
          <section
            className="modal welcome"
            role="dialog"
            aria-modal="true"
            aria-labelledby="welcome-title"
          >
            <span className="modal-seal">
              <Icon name="castle" size={38} />
            </span>
            <span className="eyebrow">집은 작아도 슬리퍼는 맵다!</span>
            <h2 id="welcome-title">
              우리집을
              <br />
              <em>지켜라!</em>
            </h2>
            <p>
              슬리퍼 신고, 살림살이 총동원!
              <br />
              시끌벅적한 불청객에게 현관 사수!
            </p>
            <div className="welcome-steps">
              <span>
                <Icon name="sword" />
                <b>불청객은 귀가!</b>
                <small>자동 공격으로 용돈 벌기</small>
              </span>
              <span>
                <Icon name="castle" />
                <b>살림살이 출동!</b>
                <small>반짝이는 빈자리에 설치</small>
              </span>
              <span>
                <Icon name="flag" />
                <b>20번만 막아봐요</b>
                <small>5번마다 큰 이웃이 딩동</small>
              </span>
            </div>
            <div className="control-note">
              PC: WASD / 방향키 이동 · Q 물벼락 · SPACE 또 온다!
              <br />
              마우스 왼쪽 드래그: 화면 이동 · 오른쪽 드래그: 회전
              <br />
              모바일: 조이스틱 이동 · 한 손가락 화면 이동
              <br />
              두 손가락 회전 · 오므리기/펴기 확대·축소
            </div>
            {choosingDifficulty && <DifficultyPicker value={difficulty} onChange={setDifficulty} />}
            <button
              className="primary full"
              onClick={() => {
                if (choosingDifficulty) {
                  reset();
                  return;
                }
                setHelp(false);
                save();
              }}
            >
              {view.wave > 0 ? "집으로 돌아가기" : "슬리퍼 신고 출발!"}
              <Icon name="arrow" size={18} />
            </button>
            <small className="save-note">
              진행 상황은 이 브라우저에 자동 저장됩니다.
            </small>
          </section>
        </div>
      )}
      {paused && !help && !confirmReset && !ended && (
        <div className="modal-backdrop">
          <section
            className="modal compact"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pause-title"
          >
            <span className="modal-seal">
              <Icon name="pause" size={32} />
            </span>
            <span className="eyebrow">물 한 잔 마시고 가요</span>
            <h2 id="pause-title">잠깐의 휴식</h2>
            <p>슬리퍼도 잠깐 쉬어야죠.</p>
            <button className="primary full" onClick={() => setPaused(false)}>
              계속하기
              <Icon name="play" size={18} />
            </button>
            <button
              className="text-button"
              onClick={() => setConfirmReset(true)}
            >
              새 게임
            </button>
          </section>
        </div>
      )}
      {confirmReset && (
        <div className="modal-backdrop">
          <section
            className="modal compact"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-title"
          >
            <h2 id="reset-title">다시 이사 온 기분!</h2>
            <p>
              현재 진행 상황을 지우고
              <br />첫 방문부터 다시 시작할까요?
            </p>
            <DifficultyPicker value={difficulty} onChange={setDifficulty} />
            <button className="primary full" onClick={reset}>
              새 게임 시작
            </button>
            <button
              className="text-button"
              onClick={() => setConfirmReset(false)}
            >
              현재 게임 유지
            </button>
          </section>
        </div>
      )}
      {ended && !help && !confirmReset && (
        <div className="modal-backdrop">
          <section
            className="modal compact"
            role="dialog"
            aria-modal="true"
            aria-labelledby="end-title"
          >
            <span className="modal-seal">
              <Icon name={view.phase === "won" ? "flag" : "shield"} size={36} />
            </span>
            <span className="eyebrow">
              {view.phase === "won"
                ? "HOME SWEET HOME!"
                : "슬리퍼가 잠깐 미끄러졌네"}
            </span>
            <h2 id="end-title">
              {view.phase === "won"
                ? "우리집 사수 성공!"
                : "앗, 집이 엉망진창!"}
            </h2>
            <p>
              {view.phase === "won"
                ? "20번의 딩동 끝! 오늘 저녁은 치킨이다!"
                : "테이프 붙이고, 슬리퍼 고쳐 신고, 한 번 더!"}
            </p>
            <div className="end-stats">
              <span>
                받아낸 방문<b>{view.wave} / 20</b>
              </span>
              <span>
                귀가시킨 불청객<b>{view.kills}</b>
              </span>
            </div>
            <button className="primary full" onClick={() => setConfirmReset(true)}>
              다시 도전하기
              <Icon name="reset" size={18} />
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
function localStorageSafeRead() {
  try {
    return localStorage.getItem(SAVE_KEY);
  } catch {
    return null;
  }
}
createRoot(document.getElementById("root")!).render(<App />);
