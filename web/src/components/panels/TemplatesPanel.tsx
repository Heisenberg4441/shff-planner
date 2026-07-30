import { useState } from 'react';
import type { ReactNode } from 'react';

import { pluralBlocks } from '../../../../shared/src/plural';
import { usePlanner } from '../../state/usePlanner';

export function TemplatesPanel(): ReactNode {
  const { state, actions } = usePlanner();
  const [capturing, setCapturing] = useState(false);
  const [name, setName] = useState('');

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setCapturing(false);
      return;
    }
    actions.captureTemplate(trimmed);
    setName('');
    setCapturing(false);
  };

  return (
    <div className="panel pl-panel">
      <div className="pl-panel-title">// ШАБЛОНЫ ДНЯ</div>

      <div className="pl-list">
        {state.templates.map((template) => (
          <div key={template.id} className="pl-tpl-row">
            <button
              type="button"
              className="pl-list-btn tpl"
              onClick={() => actions.applyTemplate(template)}
              title={template.note || `применить к ${state.date}`}
            >
              <span className="k">{template.name}</span>
              <span className="v">{pluralBlocks(template.rows.length)}</span>
            </button>
            {template.kind === 'user' && (
              <button
                type="button"
                className="pl-mini danger"
                onClick={() => actions.deleteTemplate(template)}
                aria-label={`удалить шаблон ${template.name}`}
                title="удалить шаблон"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>

      {capturing ? (
        <div className="pl-cat-line" style={{ marginTop: 6 }}>
          <input
            className="input"
            autoFocus
            placeholder="как назвать шаблон"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submit();
              if (event.key === 'Escape') {
                setCapturing(false);
                setName('');
              }
            }}
          />
          <button className="pl-mini" type="button" onClick={submit}>
            ок
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="pl-list-btn"
          style={{ marginTop: 6 }}
          onClick={() => setCapturing(true)}
          title={`снять шаблон с разметки ${state.date}`}
        >
          <span className="k">[&nbsp;+ снять с этих суток&nbsp;]</span>
        </button>
      )}
    </div>
  );
}
