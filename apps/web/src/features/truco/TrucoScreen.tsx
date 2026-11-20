import { useEffect, useState } from 'react';

/**
 * Anotador de truco. Todo queda en este teléfono (localStorage): no usa la cuenta ni el servidor,
 * así anda sin internet y la partida sigue aunque se cierre la app.
 */

type Team = 0 | 1;
interface Game {
  names: [string, string];
  /** 15 o 30 (a 30: 15 malas + 15 buenas) */
  target: 15 | 30;
  score: [number, number];
  /** Para deshacer: qué equipo sumó y cuánto, en orden */
  log: { team: Team; points: number }[];
  /** Partidas ganadas en esta tanda */
  wins: [number, number];
}

const KEY = 'gastos.truco.v1';
const fresh = (prev?: Game): Game => ({
  names: prev?.names ?? ['Nosotros', 'Ellos'],
  target: prev?.target ?? 30,
  score: [0, 0],
  log: [],
  wins: prev?.wins ?? [0, 0],
});

function load(): Game {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const g = JSON.parse(raw) as Game;
      if (Array.isArray(g.score) && Array.isArray(g.names)) return { ...fresh(), ...g };
    }
  } catch {
    /* sin almacenamiento: arranca de cero */
  }
  return fresh();
}

function save(g: Game) {
  try {
    localStorage.setItem(KEY, JSON.stringify(g));
  } catch {
    /* ignorar */
  }
}

/** Mantiene la pantalla prendida mientras se juega (si el navegador lo permite). */
function useWakeLock() {
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    let alive = true;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    const request = async () => {
      try {
        if (nav.wakeLock && document.visibilityState === 'visible') {
          const l = await nav.wakeLock.request('screen');
          if (alive) lock = l;
          else void l.release();
        }
      } catch {
        /* sin permiso o sin soporte */
      }
    };
    void request();
    const onVisible = () => document.visibilityState === 'visible' && void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release().catch(() => {});
    };
  }, []);
}

export function TrucoScreen() {
  const [game, setGame] = useState<Game>(load);
  const [confirmReset, setConfirmReset] = useState(false);
  useWakeLock();

  const update = (fn: (g: Game) => Game) =>
    setGame((g) => {
      const next = fn(g);
      save(next);
      return next;
    });

  const winner: Team | null = game.score[0] >= game.target ? 0 : game.score[1] >= game.target ? 1 : null;

  const add = (team: Team, points: number) =>
    update((g) => {
      if (g.score[0] >= g.target || g.score[1] >= g.target) return g;
      const real = Math.max(-g.score[team], Math.min(points, g.target - g.score[team]));
      if (!real) return g;
      const score: [number, number] = [...g.score];
      score[team] += real;
      const won = score[team] >= g.target;
      const wins: [number, number] = [...g.wins];
      if (won) wins[team] += 1;
      return { ...g, score, wins, log: [...g.log, { team, points: real }] };
    });

  const undo = () =>
    update((g) => {
      const last = g.log[g.log.length - 1];
      if (!last) return g;
      const wasWon = g.score[last.team] >= g.target;
      const score: [number, number] = [...g.score];
      score[last.team] -= last.points;
      const wins: [number, number] = [...g.wins];
      if (wasWon) wins[last.team] = Math.max(0, wins[last.team] - 1);
      return { ...g, score, wins, log: g.log.slice(0, -1) };
    });

  const newGame = () => {
    setConfirmReset(false);
    update((g) => fresh(g));
  };

  const setTarget = (target: 15 | 30) => update((g) => ({ ...g, target }));
  const rename = (team: Team, name: string) =>
    update((g) => {
      const names: [string, string] = [...g.names];
      names[team] = name.slice(0, 16);
      return { ...g, names };
    });

  const started = game.score[0] > 0 || game.score[1] > 0;

  return (
    <div className="page truco">
      <header className="page-head truco-head">
        <h1>Truco</h1>
        <div className="segmented truco-target" aria-label="A cuánto">
          {([15, 30] as const).map((t) => (
            <button key={t} type="button" className={game.target === t ? 'is-on' : ''} disabled={started && game.target !== t} onClick={() => setTarget(t)}>
              A {t}
            </button>
          ))}
        </div>
      </header>

      {winner !== null && (
        <div className="truco-win" role="status">
          <p>
            🏆 ¡Ganó <strong>{game.names[winner] || (winner === 0 ? 'Nosotros' : 'Ellos')}</strong>!
          </p>
          <button type="button" className="btn-primary" onClick={newGame}>
            Otra partida
          </button>
        </div>
      )}

      <div className="truco-board">
        {([0, 1] as const).map((team) => (
          <section key={team} className={`truco-team${winner === team ? ' is-winner' : ''}`}>
            <input
              className="truco-name"
              value={game.names[team]}
              onChange={(e) => rename(team, e.target.value)}
              onBlur={(e) => !e.target.value.trim() && rename(team, team === 0 ? 'Nosotros' : 'Ellos')}
              aria-label={`Nombre del equipo ${team + 1}`}
            />
            <p className="truco-score">
              {game.score[team]}
              {game.target === 30 && <small>{game.score[team] > 15 ? 'buenas' : 'malas'}</small>}
            </p>

            <button type="button" className="truco-tap" onClick={() => add(team, 1)} disabled={winner !== null} aria-label={`Sumar un punto a ${game.names[team]}`}>
              <Palitos score={game.score[team]} target={game.target} />
            </button>

            <div className="truco-quick">
              <button type="button" onClick={() => add(team, -1)} disabled={game.score[team] === 0 || winner !== null} aria-label="Restar un punto">
                −1
              </button>
              {[2, 3, 4].map((n) => (
                <button key={n} type="button" onClick={() => add(team, n)} disabled={winner !== null}>
                  +{n}
                </button>
              ))}
            </div>
            {(game.wins[0] > 0 || game.wins[1] > 0) && (
              <p className="truco-wins">
                {game.wins[team]} {game.wins[team] === 1 ? 'partida' : 'partidas'}
              </p>
            )}
          </section>
        ))}
      </div>

      <div className="row-actions">
        <button type="button" className="btn-quiet" onClick={undo} disabled={!game.log.length}>
          ↶ Deshacer
        </button>
        {confirmReset ? (
          <button type="button" className="btn-danger" onClick={newGame}>
            ¿Empezar de cero?
          </button>
        ) : (
          <button type="button" className="btn-quiet" onClick={() => (started && winner === null ? setConfirmReset(true) : newGame())} disabled={!started}>
            Nueva partida
          </button>
        )}
      </div>
      {(game.wins[0] > 0 || game.wins[1] > 0) && (
        <button type="button" className="link truco-reset-wins" onClick={() => update((g) => ({ ...g, wins: [0, 0] }))}>
          Poner las partidas ganadas en cero
        </button>
      )}
      <p className="hint page-foot">Tocá la columna para sumar un punto. Los botones suman lo de envido, truco, retruco o vale cuatro.</p>
    </div>
  );
}

/** Palitos de a cinco: cuadradito (cuatro lados) y la diagonal. A 30, separa malas y buenas. */
function Palitos({ score, target }: { score: number; target: 15 | 30 }) {
  const halves = target === 30 ? [Math.min(score, 15), Math.max(0, score - 15)] : [score];
  return (
    <span className="palitos">
      {halves.map((pts, h) => (
        <span key={h} className="palitos-half">
          {[0, 1, 2].map((g) => (
            <Group key={g} n={Math.max(0, Math.min(5, pts - g * 5))} />
          ))}
          {target === 30 && h === 0 && <span className="palitos-split">buenas</span>}
        </span>
      ))}
    </span>
  );
}

function Group({ n }: { n: number }) {
  // Orden clásico: izquierda, arriba, derecha, abajo y la diagonal
  const lines: [number, number, number, number][] = [
    [8, 8, 8, 52],
    [8, 8, 52, 8],
    [52, 8, 52, 52],
    [8, 52, 52, 52],
    [8, 52, 52, 8],
  ];
  return (
    <svg viewBox="0 0 60 60" className="palitos-group" aria-hidden="true">
      {lines.map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className={i < n ? 'on' : 'off'} />
      ))}
    </svg>
  );
}
