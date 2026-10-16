import '@fontsource/noto-sans-thai/400.css';
import '@fontsource/noto-sans-thai/600.css';
import './styles.css';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { T } from './strings.th';

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary label="app" fallback={() => (
    <div className="center-page">
      <div className="panel" role="alert">
        <h1>{T.appFailedTitle}</h1>
        <p className="muted">{T.appFailedHelp}</p>
        <button className="primary" onClick={() => location.reload()}>{T.reload}</button>
      </div>
    </div>
  )}>
    <App />
  </ErrorBoundary>,
);
