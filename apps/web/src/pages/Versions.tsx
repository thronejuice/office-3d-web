import { CHANGELOG, CURRENT_VERSION } from '../changelog';
import { T } from '../strings.th';
import { navigate } from '../router';

/** Admin-only list of every release and its notes. */
export default function Versions() {
  return (
    <div className="page">
      <header>
        <button className="secondary" onClick={() => navigate('/')}><span aria-hidden="true">←</span> {T.back}</button>
        <h1 style={{ margin: 0 }} className="grow">{T.versionsTitle}</h1>
      </header>
      {CHANGELOG.map((r) => (
        <section key={r.version} className="panel" style={{ marginBottom: 12 }}>
          <h2 style={{ marginTop: 0 }}>
            {T.versionLabel(r.version)} · {r.title} {r.version === CURRENT_VERSION && <span className="small muted">({T.versionCurrent})</span>}
          </h2>
          <ul>{r.notes.map((n) => <li key={n}>{n}</li>)}</ul>
        </section>
      ))}
    </div>
  );
}
